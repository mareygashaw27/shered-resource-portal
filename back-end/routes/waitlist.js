const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { format } = require('date-fns');

// Join Waitlist (FR-026)
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { resourceId, desiredStart, desiredEnd } = req.body;

    const result = await query(`
      INSERT INTO waitlist (resource_id, requested_by, desired_start, desired_end, status)
      VALUES (?, ?, ?, ?, 'waiting')
    `, [resourceId, req.user.id, desiredStart, desiredEnd]);

    await query(`INSERT INTO audit_logs (user_id, action, details) VALUES (?, 'JOIN_WAITLIST', ?)`,
      [req.user.id, JSON.stringify({ resourceId, desiredStart, desiredEnd })]);

    res.status(201).json({ message: 'Successfully joined waitlist!', waitlistId: result.insertId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// My Waitlist Entries
router.get('/my', authenticateToken, async (req, res) => {
  try {
    const list = await query(`
      SELECT w.*, r.name as resource_name, r.type, r.location
      FROM waitlist w
      JOIN resources r ON w.resource_id = r.id
      WHERE w.requested_by = ?
      ORDER BY w.created_at DESC
    `, [req.user.id]);
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Accept Waitlist Offer
router.post('/accept/:id', authenticateToken, async (req, res) => {
  try {
    const waitlistId = req.params.id;
    const entries = await query('SELECT * FROM waitlist WHERE id = ? AND requested_by = ?', [waitlistId, req.user.id]);
    if (entries.length === 0) return res.status(404).json({ error: 'Waitlist offer not found' });
    const entry = entries[0];

    if (entry.status !== 'offered') {
      return res.status(400).json({ error: 'Offer is no longer active' });
    }

    const bookingRef = `BK-2026-W${Math.floor(1000 + Math.random() * 9000)}`;

    const bookingResult = await query(`
      INSERT INTO bookings (
        booking_ref, resource_id, user_id, title, start_datetime, end_datetime, status
      ) VALUES (?, ?, ?, 'Waitlist Promoted Booking', ?, ?, 'confirmed')
    `, [bookingRef, entry.resource_id, req.user.id, entry.desired_start, entry.desired_end]);

    await query(`UPDATE waitlist SET status = 'accepted' WHERE id = ?`, [waitlistId]);

    req.io.emit('booking_created', { bookingId: bookingResult.insertId, resourceId: entry.resource_id, status: 'confirmed' });

    res.json({ message: 'Waitlist offer accepted! Booking confirmed.', bookingRef });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
