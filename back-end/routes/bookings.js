const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { authenticateToken, checkRole } = require('../middleware/auth');
const { checkResourceAvailability, checkUserSimultaneousLimit } = require('../services/conflictEngine');
const { format, addWeeks, addDays, addMonths, parseISO, differenceInHours, differenceInMinutes, isBefore } = require('date-fns');
const { sendBookingConfirmation, sendApprovalRequest, sendBookingCancellation } = require('../services/emailService');


// Get All Bookings (for Visual Calendar FR-010)
// Scope: all active bookings (confirmed, pending, on_hold) to accurately calculate calendar availability
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { start, end, category, resourceId } = req.query;
    let sql = `
      SELECT b.*, r.name as resource_name, r.type as resource_type, r.category as resource_category, 
             r.requires_approval, r.requires_checkin, r.capacity, u.name as user_name, u.email as user_email,
             u.department as user_department
      FROM bookings b
      JOIN resources r ON b.resource_id = r.id
      LEFT JOIN users u ON b.user_id = u.id
      WHERE b.status IN ('confirmed', 'checked_in', 'pending', 'on_hold')
    `;
    const params = [];

    if (start && end) {
      sql += ` AND (b.start_datetime < ? AND b.end_datetime > ?)`;
      params.push(end, start);
    }

    if (resourceId) {
      sql += ` AND b.resource_id = ?`;
      params.push(resourceId);
    }

    if (category) {
      sql += ` AND r.category = ?`;
      params.push(category);
    }

    sql += ' ORDER BY b.start_datetime ASC';
    const bookings = await query(sql, params);

    res.json(bookings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single booking by ID (used by CheckInModal polling to detect mobile QR check-in)
router.get('/detail/:id', authenticateToken, async (req, res) => {
  try {
    const bookingId = req.params.id;
    const rows = await query(`
      SELECT b.*, r.name as resource_name, r.location,
             u.name as user_name, u.email as user_email,
             ci.id as check_in_id, ci.checked_in_at, ci.check_in_method
      FROM bookings b
      JOIN resources r ON b.resource_id = r.id
      JOIN users u ON b.user_id = u.id
      LEFT JOIN check_ins ci ON ci.booking_id = b.id
      WHERE b.id = ?
    `, [bookingId]);
    if (rows.length === 0) return res.status(404).json({ error: 'Booking not found' });
    const bk = rows[0];
    res.json({
      ...bk,
      check_ins: bk.check_in_id ? [{ id: bk.check_in_id, checked_in_at: bk.checked_in_at, method: bk.check_in_method }] : []
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/my', authenticateToken, async (req, res) => {

  try {
    // Automatically purge cancelled, no-show, or inactive resource bookings from DB
    try {
      await query(`
        DELETE FROM check_ins WHERE booking_id IN (
          SELECT b.id FROM bookings b 
          LEFT JOIN resources r ON b.resource_id = r.id 
          WHERE b.status IN ('cancelled', 'no_show') OR r.is_active = 0 OR r.id IS NULL
        )
      `);
      await query(`
        DELETE FROM approvals WHERE booking_id IN (
          SELECT b.id FROM bookings b 
          LEFT JOIN resources r ON b.resource_id = r.id 
          WHERE b.status IN ('cancelled', 'no_show') OR r.is_active = 0 OR r.id IS NULL
        )
      `);
      await query(`
        DELETE FROM feedback WHERE booking_id IN (
          SELECT b.id FROM bookings b 
          LEFT JOIN resources r ON b.resource_id = r.id 
          WHERE b.status IN ('cancelled', 'no_show') OR r.is_active = 0 OR r.id IS NULL
        )
      `);
      await query(`
        DELETE FROM bookings 
        WHERE status IN ('cancelled', 'no_show') 
           OR resource_id NOT IN (SELECT id FROM resources WHERE is_active = 1)
      `);
    } catch (e) {
      console.error('[Purge Error]', e.message);
    }

    // Super admin and resource_manager see ALL bookings; others see their own bookings
    let mySql = `
      SELECT b.*, r.name as resource_name, r.location, r.image_url, r.requires_checkin,
             c.checked_in_at, c.checked_out_at, f.rating, f.comment,
             a.reason as rejection_reason, a.status as approval_status,
             ap_u.name as approver_name,
             u.name as user_name, u.email as user_email, u.department as user_department
      FROM bookings b
      JOIN resources r ON b.resource_id = r.id
      LEFT JOIN users u ON b.user_id = u.id
      LEFT JOIN check_ins c ON b.id = c.booking_id
      LEFT JOIN feedback f ON b.id = f.booking_id
      LEFT JOIN (
        SELECT booking_id, MAX(id) AS latest_approval_id
        FROM approvals
        GROUP BY booking_id
      ) latest_ap ON latest_ap.booking_id = b.id
      LEFT JOIN approvals a ON a.id = latest_ap.latest_approval_id
      LEFT JOIN users ap_u ON a.approver_id = ap_u.id
      WHERE b.status NOT IN ('cancelled', 'no_show')
        AND (r.is_active = 1 OR r.is_active IS NULL)
    `;
    const myParams = [];

    // Scope: super_admin & resource_manager see ALL bookings; all other roles (department_head, staff, auditor) see ONLY their own bookings
    if (!['super_admin', 'resource_manager'].includes(req.user.role)) {
      mySql += ` AND (b.user_id = ? OR b.booked_for_user_id = ?)`;
      myParams.push(req.user.id, req.user.id);
    }

    mySql += ' ORDER BY b.start_datetime DESC';
    const bookings = await query(mySql, myParams);

    res.json(bookings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// Clear my bookings (Clean slate for current user)
router.delete('/my-clear', authenticateToken, async (req, res) => {
  try {
    const userBookings = await query(`SELECT id FROM bookings WHERE user_id = ? OR booked_for_user_id = ?`, [req.user.id, req.user.id]);
    const ids = userBookings.map(b => b.id);
    if (ids.length > 0) {
      const placeholders = ids.map(() => '?').join(',');
      await query(`DELETE FROM check_ins WHERE booking_id IN (${placeholders})`, ids);
      await query(`DELETE FROM feedback WHERE booking_id IN (${placeholders})`, ids);
      await query(`DELETE FROM approvals WHERE booking_id IN (${placeholders})`, ids);
      await query(`DELETE FROM bookings WHERE id IN (${placeholders})`, ids);
    }
    res.json({ message: 'My bookings cleared successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Clear all bookings (Clean slate)
router.delete('/clear-all', async (req, res) => {
  try {
    await query('DELETE FROM check_ins');
    await query('DELETE FROM feedback');
    await query('DELETE FROM approvals');
    await query('DELETE FROM bookings');
    await query('DELETE FROM resource_availability_exceptions');
    res.json({ message: 'All bookings cleared successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete specific booking completely by ID
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const bookingId = req.params.id;
    await query('DELETE FROM check_ins WHERE booking_id = ?', [bookingId]);
    await query('DELETE FROM feedback WHERE booking_id = ?', [bookingId]);
    await query('DELETE FROM approvals WHERE booking_id = ?', [bookingId]);
    await query('DELETE FROM bookings WHERE id = ?', [bookingId]);

    req.io.emit('booking_updated', { bookingId, status: 'deleted' });
    res.json({ message: 'Booking deleted successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// Create Booking (FR-014 to FR-023)
router.post('/', authenticateToken, async (req, res) => {
  try {
    // Auditor cannot create bookings according to RBAC Matrix
    if (req.user.role === 'auditor') {
      return res.status(403).json({ error: 'Auditors have read-only access and cannot make bookings.' });
    }

    const {
      resource_id, title, start_datetime, end_datetime,
      is_recurring, recurrence_pattern, recurrence_end_date,
      attendees, special_requirements, booked_for_user_id
    } = req.body;

    const userId = req.user.id;

    // Delegate booking check (Book on behalf of another user)
    if (booked_for_user_id && booked_for_user_id !== userId) {
      if (!['super_admin', 'resource_manager'].includes(req.user.role)) {
        return res.status(403).json({ error: 'Only Super Admin and Resource Manager can book on behalf of another person.' });
      }
    }

    const targetUserId = (booked_for_user_id && ['super_admin', 'resource_manager'].includes(req.user.role))
      ? booked_for_user_id
      : userId;

    // 1. Fetch User and Resource Details
    const users = await query('SELECT * FROM users WHERE id = ?', [targetUserId]);
    if (users.length === 0) return res.status(404).json({ error: 'Target user not found' });
    const user = users[0];

    // Penalty suspension check disabled per user request


    const resources = await query('SELECT * FROM resources WHERE id = ?', [resource_id]);
    if (resources.length === 0) return res.status(404).json({ error: 'Resource not found' });
    const resource = resources[0];

    const reqStart = new Date(start_datetime);
    const reqEnd = new Date(end_datetime);

    if (isNaN(reqStart.getTime()) || isNaN(reqEnd.getTime())) {
      return res.status(400).json({ error: 'Please provide valid start and end dates/times.' });
    }

    if (reqEnd <= reqStart) {
      return res.status(400).json({ error: 'End time must be after start time.' });
    }

    // Capacity check
    if (attendees && attendees > resource.capacity && resource.capacity > 0) {
      return res.status(400).json({
        error: `Requested attendees (${attendees}) exceeds resource capacity (${resource.capacity}).`
      });
    }

    // 5. Business Rule BR-001: Max 2 simultaneous meetings (Only enforced for regular staff, bypassed for Super Admin & Resource Manager)
    if (!['super_admin', 'resource_manager'].includes(req.user.role)) {
      const isLimitExceeded = await checkUserSimultaneousLimit(targetUserId, reqStart, reqEnd);
      if (isLimitExceeded) {
        return res.status(400).json({
          error: 'You already have 2 active bookings for this time window. Staff members cannot book more than 2 simultaneous meetings. Please choose a different time slot.'
        });
      }
    }

    // 6. Conflict Detection Engine
    const { isAvailable } = await checkResourceAvailability(resource.id, reqStart, reqEnd);

    if (!isAvailable) {
      return res.status(409).json({
        conflict: true,
        message: 'Conflict Detected! The selected resource is unavailable during this time slot.'
      });
    }

    // Determine Status: Pending if requires approval, Confirmed otherwise
    const bookingStatus = resource.requires_approval ? 'pending' : 'confirmed';
    const bookingRef = `BK-2026-${Math.floor(1000 + Math.random() * 9000)}`;

    const result = await query(`
      INSERT INTO bookings (
        booking_ref, resource_id, user_id, booked_for_user_id, title,
        start_datetime, end_datetime, is_recurring, recurrence_rule,
        attendees, special_requirements, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      bookingRef, resource.id, userId, targetUserId, title,
      format(reqStart, 'yyyy-MM-dd HH:mm:ss'), format(reqEnd, 'yyyy-MM-dd HH:mm:ss'),
      is_recurring ? 1 : 0, recurrence_pattern || null,
      attendees || 1, special_requirements || null, bookingStatus
    ]);

    const bookingId = result.insertId;

    // Create approval record if approval required
    if (resource.requires_approval) {
      await query(`INSERT INTO approvals (booking_id, approver_id, status) VALUES (?, 2, 'pending')`, [bookingId]);
      
      // Dispatch email notification to manager/approver
      const managers = await query(`SELECT email FROM users WHERE role IN ('super_admin', 'resource_manager') LIMIT 1`);
      if (managers.length > 0) {
        sendApprovalRequest(managers[0].email, {
          bookingRef,
          title,
          user_name: user.name,
          user_email: user.email,
          resource_name: resource.name,
          start_datetime: format(reqStart, 'yyyy-MM-dd HH:mm'),
          end_datetime: format(reqEnd, 'yyyy-MM-dd HH:mm')
        }).catch(e => console.error('[Email Error]', e.message));
      }
    } else {
      // Dispatch booking confirmation email to target user's real email address
      if (user.email) {
        sendBookingConfirmation(user.email, {
          bookingRef,
          title,
          user_name: user.name,
          resource_name: resource.name,
          start_datetime: format(reqStart, 'yyyy-MM-dd HH:mm'),
          end_datetime: format(reqEnd, 'yyyy-MM-dd HH:mm')
        }).catch(e => console.error('[Email Error]', e.message));
      }
    }

    // Audit Log
    await query(`INSERT INTO audit_logs (user_id, action, booking_id, details) VALUES (?, 'CREATE_BOOKING', ?, ?)`,
      [userId, bookingId, JSON.stringify({ bookingRef, resourceId: resource.id, status: bookingStatus })]);

    req.io.emit('booking_created', { bookingId, resourceId: resource.id, bookingRef, status: bookingStatus });
    req.io.emit('approval_updated', { bookingId, status: bookingStatus });

    // Live notification — targeted to the booking requester + admins/managers
    const notifTitle = bookingStatus === 'pending'
      ? 'Booking Submitted for Approval 📋'
      : 'Booking Confirmed! ✅';
    const notifMsg = bookingStatus === 'pending'
      ? `Your booking "${title}" (${bookingRef}) for ${resource.name} has been submitted and is awaiting approval.`
      : `Your booking "${title}" (${bookingRef}) for ${resource.name} is confirmed!`;
    req.io.emit('notification', {
      id: Date.now(),
      title: notifTitle,
      message: notifMsg,
      timestamp: new Date(),
      userId: targetUserId,   // the person the booking is for
      forRoles: ['super_admin', 'resource_manager']  // admins see all
    });

    res.status(201).json({
      message: bookingStatus === 'pending' ? 'Booking submitted for approval' : 'Booking confirmed!',
      bookingRef,
      bookingId,
      status: bookingStatus,
      emailNotified: user.email
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Mobile QR Direct Quick Check-In (Scanned via Phone Camera / Chrome)
router.get('/quick-checkin', async (req, res) => {
  try {
    const { ref, email } = req.query;

    if (!ref) {
      return res.status(400).send(`
        <!DOCTYPE html>
        <html>
        <head><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Check-In Error</title>
        <style>body{font-family:sans-serif;text-align:center;padding:40px 20px;background:#0f172a;color:#f8fafc;}</style></head>
        <body>
          <h2 style="color:#ef4444;">❌ Invalid QR Code</h2>
          <p style="color:#94a3b8;margin-top:10px;">Missing booking reference.</p>
        </body></html>
      `);
    }

    const bookings = await query(`
      SELECT b.*, r.name as resource_name, r.location, u.name as user_name, u.email as user_email
      FROM bookings b
      JOIN resources r ON b.resource_id = r.id
      JOIN users u ON b.user_id = u.id
      WHERE b.booking_ref = ?
    `, [ref]);

    if (bookings.length === 0) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Booking Not Found</title>
        <style>body{font-family:sans-serif;text-align:center;padding:40px 20px;background:#0f172a;color:#f8fafc;}</style></head>
        <body>
          <h2 style="color:#ef4444;">❌ Booking Not Found</h2>
          <p style="color:#94a3b8;margin-top:10px;">No booking found with reference <strong>${ref}</strong>.</p>
        </body></html>
      `);
    }

    const bk = bookings[0];

    // Check if already checked in
    const existingCheckin = await query('SELECT * FROM check_ins WHERE booking_id = ?', [bk.id]);
    const isAlreadyCheckedIn = existingCheckin.length > 0;
    const nowStr = format(new Date(), 'yyyy-MM-dd HH:mm:ss');

    if (!isAlreadyCheckedIn) {
      await query(`INSERT INTO check_ins (booking_id, checked_in_at, check_in_method) VALUES (?, ?, 'qr')`,
        [bk.id, nowStr]);

      await query(`INSERT INTO audit_logs (user_id, action, booking_id, details) VALUES (?, 'MOBILE_QR_CHECK_IN', ?, ?)`,
        [bk.user_id, bk.id, JSON.stringify({ method: 'qr_mobile', ref, email: bk.user_email, timestamp: nowStr })]);

      // Broadcast live update so desktop immediately shows check-in completed
      if (req.io) {
        req.io.emit('booking_updated', { bookingId: bk.id, status: 'checked_in' });
        req.io.emit('notification', {
          id: Date.now(),
          title: 'Mobile QR Check-In Confirmed! ✅',
          message: `Booking "${bk.title}" (${bk.booking_ref}) checked in successfully via mobile QR scan.`,
          timestamp: new Date(),
          userId: bk.user_id,
          forRoles: ['super_admin', 'resource_manager']
        });
      }
    }

    res.send(`
      <!DOCTYPE html>
      <html lang="am">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Check-In Successful</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
            color: #f8fafc;
          }
          .card {
            background: #1e293b;
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 20px;
            padding: 32px 24px;
            max-width: 420px;
            width: 100%;
            text-align: center;
            box-shadow: 0 20px 40px rgba(0,0,0,0.5);
          }
          .icon-box {
            width: 80px;
            height: 80px;
            border-radius: 50%;
            background: rgba(16, 185, 129, 0.15);
            border: 2px solid #10b981;
            color: #10b981;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 40px;
            margin: 0 auto 20px auto;
            box-shadow: 0 0 24px rgba(16, 185, 129, 0.3);
          }
          h1 {
            font-size: 20px;
            font-weight: 800;
            color: #ffffff;
            margin-bottom: 6px;
          }
          .sub {
            font-size: 13.5px;
            color: #94a3b8;
            margin-bottom: 24px;
          }
          .info-box {
            background: rgba(15, 23, 42, 0.6);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 12px;
            padding: 16px;
            text-align: left;
            margin-bottom: 24px;
            font-size: 13px;
          }
          .info-row {
            display: flex;
            justify-content: space-between;
            padding: 7px 0;
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          }
          .info-row:last-child { border-bottom: none; }
          .label { color: #94a3b8; }
          .value { color: #f8fafc; font-weight: 700; text-align: right; }
          .badge {
            display: inline-block;
            background: rgba(16, 185, 129, 0.2);
            color: #34d399;
            padding: 6px 14px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 700;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="icon-box">✓</div>
          <h1>${isAlreadyCheckedIn ? 'ቀድሞ ቼክ-ኢን ተደርጓል!' : 'ቼክ-ኢን በተሳካ ሁኔታ ተጠናቋል!'}</h1>
          <p class="sub">${isAlreadyCheckedIn ? 'Already Checked-In' : 'Check-In Confirmed via Mobile QR'}</p>

          <div class="info-box">
            <div class="info-row">
              <span class="label">የቀጠሮ ርዕስ (Title):</span>
              <span class="value">${bk.title}</span>
            </div>
            <div class="info-row">
              <span class="label">የቦታ ስም (Resource):</span>
              <span class="value">${bk.resource_name}</span>
            </div>
            <div class="info-row">
              <span class="label">የቡኪንግ ቁጥር (Ref):</span>
              <span class="value" style="color: #60a5fa;">${bk.booking_ref}</span>
            </div>
            <div class="info-row">
              <span class="label">ተጠቃሚ (User):</span>
              <span class="value">${bk.user_name}</span>
            </div>
            <div class="info-row">
              <span class="label">ኢሜይል (Email):</span>
              <span class="value" style="font-size: 11.5px;">${bk.user_email}</span>
            </div>
            <div class="info-row">
              <span class="label">ሰዓት (Time):</span>
              <span class="value" style="font-size: 11.5px;">${nowStr}</span>
            </div>
          </div>

          <div class="badge">
            ● Status: Checked-In Active ✅
          </div>
        </div>
      </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send(`Server Error: ${err.message}`);
  }
});

// Check-In Endpoint (FR-027, FR-028)
router.post('/:id/checkin', authenticateToken, async (req, res) => {
  try {
    if (req.user.role === 'auditor') {
      return res.status(403).json({ error: 'Check-in is restricted for auditor role.' });
    }

    const bookingId = req.params.id;
    const { method } = req.body; // 'web' or 'qr'

    const bookings = await query('SELECT * FROM bookings WHERE id = ?', [bookingId]);
    if (bookings.length === 0) return res.status(404).json({ error: 'Booking not found' });
    const bk = bookings[0];

    // Verify user owns booking or is super_admin / resource_manager
    const isOwner = bk.user_id === req.user.id || bk.booked_for_user_id === req.user.id;
    const isAdmin = ['super_admin', 'resource_manager'].includes(req.user.role);
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'You can only check-in to your own bookings' });
    }

    const nowStr = format(new Date(), 'yyyy-MM-dd HH:mm:ss');
    await query(`INSERT INTO check_ins (booking_id, checked_in_at, check_in_method) VALUES (?, ?, ?)`,
      [bookingId, nowStr, method || 'web']);

    await query(`INSERT INTO audit_logs (user_id, action, booking_id, details) VALUES (?, 'CHECK_IN', ?, ?)`,
      [req.user.id, bookingId, JSON.stringify({ method: method || 'web', timestamp: nowStr })]);

    req.io.emit('booking_updated', { bookingId, status: 'checked_in' });

    res.json({ message: 'Check-in successful!', checked_in_at: nowStr });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Check-Out Endpoint (FR-030, FR-031)
router.post('/:id/checkout', authenticateToken, async (req, res) => {
  try {
    if (req.user.role === 'auditor') {
      return res.status(403).json({ error: 'Check-out is restricted for auditor role.' });
    }

    const bookingId = req.params.id;
    const { rating, comment } = req.body;

    const bookings = await query('SELECT * FROM bookings WHERE id = ?', [bookingId]);
    if (bookings.length === 0) return res.status(404).json({ error: 'Booking not found' });
    const bk = bookings[0];

    const isOwner = bk.user_id === req.user.id || bk.booked_for_user_id === req.user.id;
    const isAdmin = ['super_admin', 'resource_manager'].includes(req.user.role);
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'You can only check-out of your own bookings' });
    }

    const nowStr = format(new Date(), 'yyyy-MM-dd HH:mm:ss');
    const existingCheckin = await query('SELECT * FROM check_ins WHERE booking_id = ?', [bookingId]);
    if (existingCheckin.length > 0) {
      await query(`UPDATE check_ins SET checked_out_at = ? WHERE booking_id = ?`, [nowStr, bookingId]);
    } else {
      await query(`INSERT INTO check_ins (booking_id, checked_in_at, checked_out_at, check_in_method) VALUES (?, ?, ?, 'web')`,
        [bookingId, nowStr, nowStr]);
    }

    await query(`UPDATE bookings SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [bookingId]);

    if (rating) {
      await query(`INSERT INTO feedback (booking_id, rating, comment) VALUES (?, ?, ?)`,
        [bookingId, parseInt(rating), comment || null]);
    }

    await query(`INSERT INTO audit_logs (user_id, action, booking_id, details) VALUES (?, 'CHECK_OUT', ?, ?)`,
      [req.user.id, bookingId, JSON.stringify({ rating, comment })]);

    req.io.emit('booking_updated', { bookingId, status: 'completed' });

    res.json({ message: 'Check-out completed and feedback saved!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Cancel Booking (FR-037, FR-038, FR-040)
router.post('/:id/cancel', authenticateToken, async (req, res) => {
  try {
    if (req.user.role === 'auditor') {
      return res.status(403).json({ error: 'Auditors cannot cancel bookings.' });
    }

    const bookingId = req.params.id;
    const { reason } = req.body;

    const bookings = await query(`
      SELECT b.*, u.department as requester_dept
      FROM bookings b
      JOIN users u ON b.user_id = u.id
      WHERE b.id = ?
    `, [bookingId]);

    if (bookings.length === 0) return res.status(404).json({ error: 'Booking not found' });
    const bk = bookings[0];

    const isAdmin = ['super_admin', 'resource_manager'].includes(req.user.role);
    const isOwner = bk.user_id === req.user.id || bk.booked_for_user_id === req.user.id;

    if (!isAdmin && !isOwner) {
      return res.status(403).json({ error: 'You do not have permission to cancel this booking. You can only cancel your own bookings.' });
    }

    const hoursUntilStart = differenceInHours(new Date(bk.start_datetime), new Date());
    const isLateCancellation = hoursUntilStart < 2 && !isAdmin;

    await query('DELETE FROM check_ins WHERE booking_id = ?', [bookingId]);
    await query('DELETE FROM feedback WHERE booking_id = ?', [bookingId]);
    await query('DELETE FROM approvals WHERE booking_id = ?', [bookingId]);
    await query('DELETE FROM bookings WHERE id = ?', [bookingId]);

    // Fetch user and resource info for cancellation email
    const bookingDetails = await query(`
      SELECT b.*, r.name as resource_name, u.email as user_email
      FROM bookings b
      JOIN resources r ON b.resource_id = r.id
      JOIN users u ON b.user_id = u.id
      WHERE b.id = ?
    `, [bookingId]);

    if (bookingDetails.length > 0 && bookingDetails[0].user_email) {
      sendBookingCancellation(bookingDetails[0].user_email, bookingDetails[0], reason).catch(e => console.error('[Email Error]', e.message));
    }

    await query(`INSERT INTO audit_logs (user_id, action, booking_id, details) VALUES (?, 'CANCEL_BOOKING', ?, ?)`,
      [req.user.id, bookingId, JSON.stringify({ reason: reason || 'User requested cancellation', isLateCancellation })]);

    req.io.emit('booking_updated', { bookingId, resourceId: bk.resource_id, status: 'cancelled' });

    res.json({
      message: 'Booking cancelled and deleted successfully.',
      isLateCancellation,
      warning: isLateCancellation ? 'Note: Late cancellation (<2 hours notice) recorded.' : null
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reschedule Booking (Row 7 RBAC: Super Admin (Any), Resource Manager (Any), Dept Head (Dept only), Staff (Own only), Auditor (✗))
router.post('/:id/reschedule', authenticateToken, async (req, res) => {
  try {
    if (req.user.role === 'auditor') {
      return res.status(403).json({ error: 'Auditors cannot reschedule bookings.' });
    }

    const bookingId = req.params.id;
    const { new_start_datetime, new_end_datetime } = req.body;

    if (!new_start_datetime || !new_end_datetime) {
      return res.status(400).json({ error: 'New start and end datetimes are required.' });
    }

    const bookings = await query(`
      SELECT b.*, u.department as requester_dept
      FROM bookings b
      JOIN users u ON b.user_id = u.id
      WHERE b.id = ?
    `, [bookingId]);

    if (bookings.length === 0) return res.status(404).json({ error: 'Booking not found' });
    const bk = bookings[0];

    const isAdmin = ['super_admin', 'resource_manager'].includes(req.user.role);
    const isOwner = bk.user_id === req.user.id || bk.booked_for_user_id === req.user.id;

    if (!isAdmin && !isOwner) {
      return res.status(403).json({ error: 'You do not have permission to reschedule this booking. You can only reschedule your own bookings.' });
    }

    const newStart = new Date(new_start_datetime);
    const newEnd = new Date(new_end_datetime);

    // Conflict Check excluding current booking
    const conflicts = await query(`
      SELECT id FROM bookings
      WHERE resource_id = ?
        AND id != ?
        AND status IN ('confirmed', 'pending')
        AND (start_datetime < ? AND end_datetime > ?)
    `, [bk.resource_id, bookingId, format(newEnd, 'yyyy-MM-dd HH:mm:ss'), format(newStart, 'yyyy-MM-dd HH:mm:ss')]);

    if (conflicts.length > 0) {
      return res.status(409).json({ error: 'Conflict! The requested time slot is unavailable.' });
    }

    await query(`
      UPDATE bookings
      SET start_datetime = ?, end_datetime = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [format(newStart, 'yyyy-MM-dd HH:mm:ss'), format(newEnd, 'yyyy-MM-dd HH:mm:ss'), bookingId]);

    await query(`INSERT INTO audit_logs (user_id, action, booking_id, details) VALUES (?, 'RESCHEDULE_BOOKING', ?, ?)`,
      [req.user.id, bookingId, JSON.stringify({ oldStart: bk.start_datetime, newStart, newEnd })]);

    req.io.emit('booking_updated', { bookingId, resourceId: bk.resource_id, status: bk.status });

    res.json({ message: 'Booking rescheduled successfully!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete Booking
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const bookingId = req.params.id;
    const bookings = await query('SELECT * FROM bookings WHERE id = ?', [bookingId]);
    if (bookings.length === 0) return res.status(404).json({ error: 'Booking not found' });
    const bk = bookings[0];

    const isAdmin = ['super_admin', 'resource_manager'].includes(req.user.role);
    const isOwner = bk.user_id === req.user.id || bk.booked_for_user_id === req.user.id;

    if (!isAdmin && !isOwner) {
      return res.status(403).json({ error: 'You do not have permission to delete this booking. You can only delete your own bookings.' });
    }

    await query('DELETE FROM check_ins WHERE booking_id = ?', [bookingId]);
    await query('DELETE FROM feedback WHERE booking_id = ?', [bookingId]);
    await query('DELETE FROM approvals WHERE booking_id = ?', [bookingId]);
    await query('DELETE FROM bookings WHERE id = ?', [bookingId]);

    await query(`INSERT INTO audit_logs (user_id, action, booking_id, details) VALUES (?, 'DELETE_BOOKING', ?, ?)`,
      [req.user.id, bookingId, JSON.stringify({ action: 'Delete booking', bookingId })]);

    req.io.emit('booking_updated', { bookingId, resourceId: bk.resource_id, status: 'deleted' });

    res.json({ message: 'Booking deleted successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Extend Booking End Time ─────────────────────────────────────────────────
// Adds extra minutes to an active booking's end_datetime (conflict-safe)
router.patch('/:id/extend', authenticateToken, async (req, res) => {
  try {
    if (req.user.role === 'auditor') {
      return res.status(403).json({ error: 'Auditors cannot extend bookings.' });
    }

    const bookingId = req.params.id;
    const { minutes } = req.body; // any positive integer (e.g. 10, 45, 90, 120…)

    const mins = Number(minutes);
    if (!minutes || isNaN(mins) || mins <= 0 || !Number.isInteger(mins)) {
      return res.status(400).json({ error: 'minutes must be a positive whole number (e.g. 10, 30, 90).' });
    }

    const bookings = await query(`
      SELECT b.*, u.department as requester_dept
      FROM bookings b JOIN users u ON b.user_id = u.id
      WHERE b.id = ?
    `, [bookingId]);

    if (bookings.length === 0) return res.status(404).json({ error: 'Booking not found.' });
    const bk = bookings[0];

    const isAdmin = ['super_admin', 'resource_manager'].includes(req.user.role);
    const isOwner = bk.user_id === req.user.id || bk.booked_for_user_id === req.user.id;

    if (!isAdmin && !isOwner) {
      return res.status(403).json({ error: 'You can only extend your own bookings.' });
    }

    if (!['confirmed', 'pending', 'checked_in'].includes(bk.status)) {
      return res.status(400).json({ error: `Cannot extend a booking with status "${bk.status}".` });
    }

    const currentEnd  = new Date(bk.end_datetime);
    const newEnd      = new Date(currentEnd.getTime() + mins * 60 * 1000);
    const newEndStr   = format(newEnd, 'yyyy-MM-dd HH:mm:ss');
    const currentEndStr = format(currentEnd, 'yyyy-MM-dd HH:mm:ss');

    // Conflict check: any OTHER booking on the same resource overlapping the extension window
    const conflicts = await query(`
      SELECT id, booking_ref, start_datetime, end_datetime
      FROM bookings
      WHERE resource_id = ?
        AND id != ?
        AND status IN ('confirmed', 'pending', 'on_hold', 'checked_in')
        AND start_datetime < ? AND end_datetime > ?
    `, [bk.resource_id, bookingId, newEndStr, currentEndStr]);

    if (conflicts.length > 0) {
      const c = conflicts[0];
      return res.status(409).json({
        error: `Cannot extend: the slot is already taken by booking ${c.booking_ref} (${c.start_datetime} – ${c.end_datetime}).`
      });
    }

    await query(
      `UPDATE bookings SET end_datetime = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [newEndStr, bookingId]
    );

    await query(
      `INSERT INTO audit_logs (user_id, action, booking_id, details) VALUES (?, 'EXTEND_BOOKING', ?, ?)`,
      [req.user.id, bookingId, JSON.stringify({ oldEnd: bk.end_datetime, newEnd: newEndStr, minutesAdded: minutes })]
    );

    req.io.emit('booking_updated', { bookingId, resourceId: bk.resource_id, status: bk.status });
    req.io.emit('notification', {
      id: Date.now(),
      title: `Booking Extended ✅`,
      message: `Booking "${bk.title}" extended by ${minutes} min — now ends at ${newEndStr}.`,
      timestamp: new Date(),
      userId: bk.user_id,
      forRoles: ['super_admin', 'resource_manager']
    });

    res.json({
      message: `Booking extended by ${minutes} minutes. New end time: ${newEndStr}`,
      new_end_datetime: newEndStr
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

