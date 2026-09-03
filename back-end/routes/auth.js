const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { query, defaultAccounts, getIsMySQL } = require('../config/database');
const { JWT_SECRET, authenticateToken } = require('../middleware/auth');
const { sendEmail, sendPasswordResetEmail } = require('../services/emailService');

// Get all users (for role switcher & book on behalf of)
router.get('/users', async (req, res) => {
  try {
    const users = await query('SELECT id, name, email, password, role, department, no_show_count, penalty_suspended_until FROM users ORDER BY id ASC');
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Login endpoint (Strict credential validation based on registered database users)
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !email.trim()) {
      return res.status(400).json({ error: 'Email address or username is required.' });
    }

    if (!password || !password.trim()) {
      return res.status(400).json({ error: 'Password is required.' });
    }

    const cleanEmail = email.trim().toLowerCase();

    // 1. Query registered user strictly from database by email or name
    let users = await query('SELECT * FROM users WHERE LOWER(email) = ? OR LOWER(name) = ?', [cleanEmail, cleanEmail]);

    // Bulletproof Auto-Heal: If default admin/system account is missing from database (e.g. freshly deployed empty DB)
    if (users.length === 0 && defaultAccounts) {
      const match = defaultAccounts.find(
        acc => acc.email.toLowerCase() === cleanEmail || acc.name.toLowerCase() === cleanEmail
      );
      if (match) {
        try {
          await query(
            'INSERT INTO users (name, email, password, role, department) VALUES (?, ?, ?, ?, ?)',
            [match.name, match.email.toLowerCase(), match.password, match.role, match.department]
          );
          users = await query('SELECT * FROM users WHERE LOWER(email) = ?', [match.email.toLowerCase()]);
          console.log(`[Auth] Auto-restored default account on login: ${match.email}`);
        } catch (e) {
          console.error('[Auth Fallback] Failed auto-provisioning account:', e.message);
        }
      }
    }

    if (users.length === 0) {
      return res.status(401).json({ error: 'Access denied: User is not registered in the system by Admin.' });
    }

    const user = users[0];

    // 2. Strict Password Verification
    const dbPassword = String(user.password || '').trim();
    const inputPassword = String(password || '').trim();

    if (!dbPassword) {
      return res.status(401).json({ error: 'No password set for this registered account. Please contact Administrator.' });
    }

    if (inputPassword !== dbPassword) {
      return res.status(401).json({ error: 'Invalid password. Access denied.' });
    }

    // 3. Issue Token for Authenticated User
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, department: user.department, name: user.name },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department,
        no_show_count: user.no_show_count,
        penalty_suspended_until: user.penalty_suspended_until
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Register endpoint (public self-registration — kept for backward compat)
router.post('/register', async (req, res) => {
  try {
    const { name, email, role, department } = req.body;

    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required' });
    }

    const cleanEmail = String(email || '').trim().toLowerCase();
    const gmailRegex = /^[a-zA-Z0-9._%+-]+@gmail\.com$/i;
    if (!gmailRegex.test(cleanEmail)) {
      return res.status(400).json({ error: 'Only valid Google/Gmail accounts (@gmail.com) are accepted.' });
    }

    // Check if email already exists
    const existing = await query('SELECT id FROM users WHERE email = ?', [cleanEmail]);
    if (existing.length > 0) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    const userRole = role || 'staff';
    const userDept = department || 'IT Department';

    const result = await query(
      'INSERT INTO users (name, email, role, department) VALUES (?, ?, ?, ?)',
      [name, email, userRole, userDept]
    );

    const userId = result.insertId;
    const token = jwt.sign(
      { id: userId, email, role: userRole, department: userDept, name },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(201).json({
      message: 'User registered successfully!',
      token,
      user: {
        id: userId,
        name,
        email,
        role: userRole,
        department: userDept,
        no_show_count: 0,
        penalty_suspended_until: null
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Super Admin: Register any actor without replacing current session
router.post('/admin-register', authenticateToken, async (req, res) => {
  try {
    // Only super_admin may use this endpoint
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Access denied: only Super Admin can register users' });
    }

    const { name, email, role, department, password } = req.body;

    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required' });
    }

    const cleanEmail = String(email || '').trim().toLowerCase();
    const gmailRegex = /^[a-zA-Z0-9._%+-]+@gmail\.com$/i;
    if (!gmailRegex.test(cleanEmail)) {
      return res.status(400).json({ error: 'Only valid Google/Gmail accounts (@gmail.com) are accepted.' });
    }

    if (!password || !password.trim()) {
      return res.status(400).json({ error: 'Password is required' });
    }

    const pwd = String(password).trim();
    const missing = [];
    if (pwd.length < 8) missing.push('at least 8 characters');
    if (!/[a-zA-Z]/.test(pwd)) missing.push('at least one letter');
    if (!/[0-9]/.test(pwd)) missing.push('at least one number');
    if (!/[^a-zA-Z0-9]/.test(pwd)) missing.push('at least one special symbol');

    if (missing.length > 0) {
      return res.status(400).json({
        error: `Password requirements not met. Missing: ${missing.join(', ')}.`
      });
    }

    const validRoles = ['super_admin', 'resource_manager', 'department_head', 'staff', 'auditor'];
    const userRole = validRoles.includes(role) ? role : 'staff';
    const userDept = department || 'IT Department';

    // Check for duplicate email
    const existing = await query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(400).json({ error: 'A user with this email already exists' });
    }

    const result = await query(
      'INSERT INTO users (name, email, password, role, department) VALUES (?, ?, ?, ?, ?)',
      [name, cleanEmail, pwd, userRole, userDept]
    );

    const newUser = {
      id: result.insertId,
      name,
      email: cleanEmail,
      password: pwd,
      role: userRole,
      department: userDept,
      no_show_count: 0,
      penalty_suspended_until: null
    };

    res.status(201).json({
      message: `User "${name}" registered successfully as ${userRole}!`,
      user: newUser
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update User Profile Endpoint (for any user to update their own Name, Email, and Password)
router.put('/update-profile', authenticateToken, async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const userId = req.user.id;

    const existingUsers = await query('SELECT * FROM users WHERE id = ?', [userId]);
    if (existingUsers.length === 0) {
      return res.status(404).json({ error: 'User not found in database.' });
    }
    const existing = existingUsers[0];

    const finalName = (name && name.trim()) ? name.trim() : existing.name;
    const finalEmail = (email && email.trim()) ? email.trim().toLowerCase() : existing.email;

    if (!finalName) {
      return res.status(400).json({ error: 'Name cannot be empty.' });
    }
    const gmailRegex = /^[a-zA-Z0-9._%+-]+@gmail\.com$/i;
    if (!finalEmail || !gmailRegex.test(finalEmail)) {
      return res.status(400).json({ error: 'Only valid Google/Gmail accounts (@gmail.com) are accepted.' });
    }

    let finalPassword = existing.password;
    if (password && password.trim() !== '') {
      const pwd = password.trim();
      const missing = [];
      if (pwd.length < 8) missing.push('at least 8 characters');
      if (!/[a-zA-Z]/.test(pwd)) missing.push('at least one letter');
      if (!/[0-9]/.test(pwd)) missing.push('at least one number');
      if (!/[^a-zA-Z0-9]/.test(pwd)) missing.push('at least one special symbol (@, #, $, !)');

      if (missing.length > 0) {
        return res.status(400).json({
          error: `Password requirements not met. Missing: ${missing.join(', ')}.`
        });
      }
      finalPassword = pwd;
    }

    // Check if new email is already taken by another user
    if (finalEmail.toLowerCase() !== (existing.email || '').toLowerCase()) {
      const duplicate = await query('SELECT id FROM users WHERE LOWER(email) = ? AND id != ?', [finalEmail.toLowerCase(), userId]);
      if (duplicate.length > 0) {
        return res.status(400).json({ error: 'Email address is already in use by another account.' });
      }
    }

    await query(
      'UPDATE users SET name = ?, email = ?, password = ? WHERE id = ?',
      [finalName, finalEmail, finalPassword, userId]
    );

    const updated = await query('SELECT id, name, email, password, role, department, no_show_count, penalty_suspended_until FROM users WHERE id = ?', [userId]);
    const updatedUser = updated[0];

    // Real-time broadcast so Super Admin and all clients see updated user data immediately
    if (req.io) {
      req.io.emit('user_updated', {
        userId,
        name: finalName,
        email: finalEmail,
        role: updatedUser.role,
        department: updatedUser.department
      });
    }

    res.json({
      message: 'Profile updated successfully in database!',
      user: updatedUser
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update User Email Endpoint (for real email notification configuration)
router.put('/update-email', authenticateToken, async (req, res) => {
  try {
    const { email } = req.body;
    const cleanEmail = String(email || '').trim().toLowerCase();
    const gmailRegex = /^[a-zA-Z0-9._%+-]+@gmail\.com$/i;
    if (!cleanEmail || !gmailRegex.test(cleanEmail)) {
      return res.status(400).json({ error: 'Only valid Google/Gmail accounts (@gmail.com) are accepted.' });
    }

    await query('UPDATE users SET email = ? WHERE id = ?', [cleanEmail, req.user.id]);
    const users = await query('SELECT id, name, email, role, department, no_show_count, penalty_suspended_until FROM users WHERE id = ?', [req.user.id]);
    
    if (req.io) {
      req.io.emit('user_updated', { userId: req.user.id, email });
    }

    res.json({
      message: 'Email notification address updated successfully!',
      user: users[0]
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Send Test Email Endpoint
router.post('/test-email', authenticateToken, async (req, res) => {
  try {
    const userEmail = req.body.email || req.user.email;
    const result = await sendEmail({
      to: userEmail,
      subject: 'Shared Resource Scheduler - Test Notification',
      html: `<div style="font-family: sans-serif; padding: 15px; border: 1px solid #2563eb; border-radius: 8px;"><h3 style="color: #2563eb;">📧 Email Notification Test Successful!</h3><p>Your account is configured to receive email notifications at <strong>${userEmail}</strong>.</p></div>`
    });

    if (result.success) {
      res.json({
        message: `Test email successfully dispatched to ${userEmail}!`,
        summary: result.summary || `Dispatched email to ${userEmail}`,
        previewUrl: result.previewUrl
      });
    } else {
      res.status(500).json({ error: result.error || 'Failed to dispatch email' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// Update User Endpoint (Super Admin only)
router.put('/users/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Access denied: only Super Admin can update users' });
    }
    const { id } = req.params;
    const { name, email, password, role, department } = req.body;

    const existingUsers = await query('SELECT * FROM users WHERE id = ?', [id]);
    if (existingUsers.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const existing = existingUsers[0];

    const cleanEmail = (email && email.trim()) ? email.trim().toLowerCase() : existing.email;
    const gmailRegex = /^[a-zA-Z0-9._%+-]+@gmail\.com$/i;
    if (email && !gmailRegex.test(cleanEmail)) {
      return res.status(400).json({ error: 'Only valid Google/Gmail accounts (@gmail.com) are accepted.' });
    }

    let finalPassword = existing.password;
    if (password && password.trim() !== '') {
      const pwd = password.trim();
      const missing = [];
      if (pwd.length < 8) missing.push('at least 8 characters');
      if (!/[a-zA-Z]/.test(pwd)) missing.push('at least one letter');
      if (!/[0-9]/.test(pwd)) missing.push('at least one number');
      if (!/[^a-zA-Z0-9]/.test(pwd)) missing.push('at least one special symbol');

      if (missing.length > 0) {
        return res.status(400).json({
          error: `Password requirements not met. Missing: ${missing.join(', ')}.`
        });
      }
      finalPassword = pwd;
    }

    await query(
      'UPDATE users SET name = ?, email = ?, password = ?, role = ?, department = ? WHERE id = ?',
      [name, email, finalPassword, role, department, id]
    );

    const updated = await query('SELECT id, name, email, password, role, department, no_show_count, penalty_suspended_until FROM users WHERE id = ?', [id]);
    res.json({ message: 'User updated successfully', user: updated[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete User Endpoint (Super Admin only - Protected against deleting admin)
router.delete('/users/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Access denied: only Super Admin can delete users' });
    }
    const { id } = req.params;
    const targetUsers = await query('SELECT id, name, email, role FROM users WHERE id = ?', [id]);
    if (targetUsers.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const target = targetUsers[0];
    if (target.role === 'super_admin' || target.email?.toLowerCase().includes('mareygashaw21@gmail.com')) {
      return res.status(403).json({ error: 'Admin accounts cannot be deleted. You can only edit them.' });
    }
    await query('DELETE FROM users WHERE id = ?', [id]);
    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reset No-Show Count (Super Admin only) — clears no-show count and suspension for a user
router.post('/users/:id/reset-noshow', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Access denied: only Super Admin can reset no-show counts' });
    }
    const { id } = req.params;
    const users = await query('SELECT id, name, email FROM users WHERE id = ?', [id]);
    if (users.length === 0) return res.status(404).json({ error: 'User not found' });

    await query('UPDATE users SET no_show_count = 0, penalty_suspended_until = NULL WHERE id = ?', [id]);
    // Also clear penalty history for this user
    await query('DELETE FROM no_show_penalties WHERE user_id = ?', [id]);

    console.log(`[Admin] No-show count reset for user #${id} (${users[0].name}) by admin #${req.user.id}`);
    res.json({
      success: true,
      message: `No-show count reset for ${users[0].name}. Booking privileges restored.`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Forgot Password Endpoint

router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !email.trim()) {
      return res.status(400).json({ error: 'Please enter your registered email address.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const users = await query('SELECT * FROM users WHERE LOWER(email) = ?', [cleanEmail]);

    if (users.length === 0) {
      return res.status(404).json({ error: 'No account found with this email address.' });
    }

    const user = users[0];
    const resetToken = crypto.randomBytes(32).toString('hex');
    
    // Save in database using native real-time NOW() + 24 hours
    const isMySQL = getIsMySQL();
    const updateSql = isMySQL
      ? 'UPDATE users SET reset_token = ?, reset_token_expires = DATE_ADD(NOW(), INTERVAL 24 HOUR) WHERE id = ?'
      : "UPDATE users SET reset_token = ?, reset_token_expires = datetime('now', '+24 hours') WHERE id = ?";

    await query(updateSql, [resetToken, user.id]);

    // Determine client origin if available from request
    const clientOrigin = req.body.origin || req.get('origin') || (req.headers.referer ? new URL(req.headers.referer).origin : 'https://shered-resource-portal.vercel.app');
    const resetUrl = `${clientOrigin}/reset-password?token=${resetToken}`;

    // Send Real-time email with Reset link (25s timeout for cloud networks)
    let emailSent = false;
    let emailError = null;
    try {
      const emailPromise = sendPasswordResetEmail(user.email, resetToken, user.name, clientOrigin);
      const timeoutPromise = new Promise(resolve => setTimeout(() => resolve({ success: false, error: 'SMTP Timeout after 25s' }), 25000));
      const emailResult = await Promise.race([emailPromise, timeoutPromise]);
      emailSent = emailResult && emailResult.success;
      if (!emailSent && emailResult && emailResult.error) {
        emailError = emailResult.error;
        console.warn('[Forgot Password] Email send result:', emailResult.error);
      }
    } catch (e) {
      emailError = e.message;
      console.warn('[Forgot Password] Email notice:', e.message);
    }

    if (!emailSent) {
      console.warn('[Forgot Password] Email delivery failed:', emailError);
      return res.status(502).json({
        success: false,
        emailSent: false,
        error: `ወደ ${user.email} ኢሜይል መላክ አልተቻለም። ምክንያት፦ ${emailError || 'የሰርቨር ግንኙነት ችግር (SMTP Timeout)'}።`,
        errorEn: `Could not send email to ${user.email}. Reason: ${emailError || 'SMTP connection timeout'}.`,
        resetToken,
        resetUrl
      });
    }

    res.json({
      success: true,
      emailSent: true,
      message: 'የይለፍ ቃል መቀየሪያ ሊንክ ወደ ኢሜይልዎ ተልኳል፤ እባክዎ ኢሜይልዎን ከፍተው ሊንኩን በመጫን የይለፍ ቃልዎን ይቀይሩ።',
      messageEn: `A password reset link has been sent to ${user.email}. Please check your inbox and follow the link to reset your password.`,
      resetToken,
      resetUrl
    });
  } catch (err) {
    console.error('[Forgot Password Error]', err);
    res.status(500).json({ error: err.message });
  }
});

// Verify Reset Token
router.get('/verify-reset-token/:token', async (req, res) => {
  try {
    const { token } = req.params;
    if (!token) {
      return res.status(400).json({ valid: false, error: 'Token is required' });
    }

    // Verify in real time using database native current time
    const isMySQL = getIsMySQL();
    const checkSql = isMySQL
      ? 'SELECT id, name, email FROM users WHERE reset_token = ? AND (reset_token_expires >= NOW() OR reset_token_expires IS NULL)'
      : "SELECT id, name, email FROM users WHERE reset_token = ? AND (reset_token_expires >= datetime('now') OR reset_token_expires IS NULL)";

    const users = await query(checkSql, [token]);

    if (users.length === 0) {
      return res.status(400).json({ valid: false, error: 'Invalid or expired password reset link.' });
    }

    const user = users[0];
    res.json({ valid: true, email: user.email, name: user.name });
  } catch (err) {
    res.status(500).json({ valid: false, error: err.message });
  }
});

// Reset Password Endpoint
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Reset token is required.' });
    }

    const pwd = String(newPassword || '').trim();
    const hasLetter = /[a-zA-Z]/.test(pwd);
    const hasNumber = /[0-9]/.test(pwd);
    const hasSymbol = /[^a-zA-Z0-9]/.test(pwd);

    if (!pwd || pwd.length < 8 || !hasLetter || !hasNumber || !hasSymbol) {
      return res.status(400).json({
        error: 'Password must be at least 8 characters long and contain letters, numbers, and special symbols (@, #, $, etc.).'
      });
    }

    // Check token validity in real time
    const isMySQL = getIsMySQL();
    const checkSql = isMySQL
      ? 'SELECT id, name, email FROM users WHERE reset_token = ? AND (reset_token_expires >= NOW() OR reset_token_expires IS NULL)'
      : "SELECT id, name, email FROM users WHERE reset_token = ? AND (reset_token_expires >= datetime('now') OR reset_token_expires IS NULL)";

    const users = await query(checkSql, [token]);

    if (users.length === 0) {
      return res.status(400).json({ error: 'Password reset link has expired or is invalid. Please request a new one.' });
    }

    const user = users[0];

    await query(
      'UPDATE users SET password = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?',
      [newPassword.trim(), user.id]
    );

    if (req.io) {
      req.io.emit('user_updated', { userId: user.id, email: user.email, name: user.name });
    }

    res.json({
      success: true,
      message: 'Your password has been successfully updated! You can now log in with your new password.'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;


