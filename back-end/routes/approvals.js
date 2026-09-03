const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { authenticateToken, checkRole } = require('../middleware/auth');
const { format } = require('date-fns');
const { sendApprovalStatusUpdate } = require('../services/emailService');

// Get Pending Approvals (Super Admin, Resource Manager, Dept Head [Dept only])
router.get('/pending', authenticateToken, checkRole(['super_admin', 'resource_manager', 'department_head']), async (req, res) => {
  try {
    let sql = `
      SELECT b.id as booking_id, b.booking_ref, b.title, b.start_datetime, b.end_datetime,
             b.attendees, b.special_requirements, b.created_at, b.status as booking_status,
             r.name as resource_name, r.type as resource_type, r.location,
             u.name as requester_name, u.email as requester_email, u.department as requester_department,
             a.reason as hold_reason, a.status as approval_status
      FROM bookings b
      JOIN resources r ON b.resource_id = r.id
      JOIN users u ON b.user_id = u.id
      LEFT JOIN (
        SELECT booking_id, MAX(id) AS latest_approval_id
        FROM approvals
        GROUP BY booking_id
      ) latest_ap ON latest_ap.booking_id = b.id
      LEFT JOIN approvals a ON a.id = latest_ap.latest_approval_id
      WHERE b.status IN ('pending', 'on_hold')
    `;
    const params = [];

    // Department Head sees pending requests for resources of their department type or users in their department
    if (req.user.role === 'department_head') {
      const dept = (req.user.department || '').toLowerCase();
      if (dept.includes('meeting room') || dept.includes('room')) {
        sql += ` AND (r.type IN ('meeting_room', 'room') OR r.resource_uuid LIKE 'MR-%' OR u.department = ? OR r.department_restriction = ?)`;
        params.push(req.user.department, req.user.department);
      } else if (dept.includes('conference')) {
        sql += ` AND (r.type = 'conference_hall' OR r.resource_uuid LIKE 'CH-%' OR u.department = ? OR r.department_restriction = ?)`;
        params.push(req.user.department, req.user.department);
      } else if (dept.includes('training') || dept.includes('lab')) {
        sql += ` AND (r.type IN ('training_lab', 'lab') OR r.resource_uuid LIKE 'TL-%' OR u.department = ? OR r.department_restriction = ?)`;
        params.push(req.user.department, req.user.department);
      } else if (dept.includes('vehicle') || dept.includes('fleet')) {
        sql += ` AND (r.type = 'vehicle' OR r.resource_uuid LIKE 'VH-%' OR u.department = ? OR r.department_restriction = ?)`;
        params.push(req.user.department, req.user.department);
      } else if (dept.includes('equipment')) {
        sql += ` AND (r.type = 'equipment' OR r.resource_uuid LIKE 'EQ-%' OR u.department = ? OR r.department_restriction = ?)`;
        params.push(req.user.department, req.user.department);
      } else {
        sql += ` AND (u.department = ? OR r.department_restriction = ?)`;
        params.push(req.user.department, req.user.department);
      }
    }

    sql += ' ORDER BY b.created_at ASC';
    const pending = await query(sql, params);
    res.json(pending);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Action on Approval (Approve / Reject / Hold FR-034)
router.post('/action', authenticateToken, checkRole(['super_admin', 'resource_manager', 'department_head']), async (req, res) => {
  try {
    const { bookingId, action, reason } = req.body; // action: 'approved', 'rejected', 'hold'

    if (!['approved', 'rejected', 'hold'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action' });
    }

    if (action === 'rejected' && !reason) {
      return res.status(400).json({ error: 'Mandatory rejection reason required' });
    }

    const bookings = await query(`
      SELECT b.*, r.name as resource_name, u.email as requester_email
      FROM bookings b
      JOIN resources r ON b.resource_id = r.id
      JOIN users u ON b.user_id = u.id
      WHERE b.id = ?
    `, [bookingId]);

    if (bookings.length === 0) return res.status(404).json({ error: 'Booking not found' });
    const bk = bookings[0];

    const newStatus = action === 'approved' ? 'confirmed' : (action === 'rejected' ? 'rejected' : 'on_hold');
    const nowStr = format(new Date(), 'yyyy-MM-dd HH:mm:ss');

    await query(`UPDATE bookings SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [newStatus, bookingId]);

    await query(`
      INSERT INTO approvals (booking_id, approver_id, status, reason, approved_at)
      VALUES (?, ?, ?, ?, ?)
    `, [bookingId, req.user.id, action, reason || null, nowStr]);

    if (bk.requester_email) {
      sendApprovalStatusUpdate(bk.requester_email, bk, action, reason).catch(e => console.error('[Email Error]', e.message));
    }

    await query(`INSERT INTO audit_logs (user_id, action, booking_id, details) VALUES (?, 'APPROVAL_ACTION', ?, ?)`,
      [req.user.id, bookingId, JSON.stringify({ action, reason, newStatus })]);

    req.io.emit('booking_updated', { bookingId, resourceId: bk.resource_id, status: newStatus });
    req.io.emit('approval_updated', { bookingId, resourceId: bk.resource_id, status: newStatus, action });
    
    // Live Notification for staff header bell icon — targeted to the booking requester
    const notifTitle = action === 'rejected' ? 'Booking Rejected ❌' : (action === 'approved' ? 'Booking Approved ✅' : 'Booking Placed on Hold ⏳');
    const notifMsg = `Booking "${bk.title}" (${bk.booking_ref}) for ${bk.resource_name} was ${action}.${reason ? ` Reason: "${reason}"` : ''}`;
    // Targeted: booking requester (by userId) + admins/managers (by forRoles)
    req.io.emit('notification', {
      id: Date.now(),
      title: notifTitle,
      message: notifMsg,
      timestamp: new Date(),
      userId: bk.user_id,         // the staff/dept-head who made the booking
      forRoles: ['super_admin', 'resource_manager']  // admins always see it too
    });

    res.json({ message: `Booking status updated to ${newStatus}`, action, newStatus, notificationSent: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
