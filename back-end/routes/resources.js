const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { authenticateToken, checkRole } = require('../middleware/auth');
const { checkResourceAvailability, findNextAvailableSlot, findAlternativeResources, findAdjacentSlots } = require('../services/conflictEngine');

const isAuthorizedForResource = async (user, resourceId) => {
  if (['super_admin', 'resource_manager'].includes(user.role)) return true;
  if (user.role === 'department_head') {
    const res = await query('SELECT type FROM resources WHERE id = ?', [resourceId]);
    if (res.length === 0) return false;
    const rType = res[0].type;
    const dept = (user.department || '').toLowerCase();
    if (dept.includes('meeting room') || dept.includes('room')) return rType === 'meeting_room' || rType === 'room';
    if (dept.includes('conference')) return rType === 'conference_hall';
    if (dept.includes('training') || dept.includes('lab')) return rType === 'training_lab' || rType === 'lab';
    if (dept.includes('vehicle') || dept.includes('fleet')) return rType === 'vehicle';
    if (dept.includes('equipment')) return rType === 'equipment';
  }
  return false;
};

// List Resources with Filtering (FR-013)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { type, category, minCapacity, location, department, search } = req.query;
    let sql = 'SELECT * FROM resources WHERE (is_active = 1 OR is_active IS NULL)';
    const params = [];

    if (type && type !== 'all') {
      if (type === 'meeting_room') {
        sql += ` AND (type = 'meeting_room' OR type = 'room' OR resource_uuid LIKE 'MR-%')`;
      } else if (type === 'training_lab') {
        sql += ` AND (type = 'training_lab' OR type = 'lab' OR resource_uuid LIKE 'TL-%')`;
      } else if (type === 'conference_hall') {
        sql += ` AND (type = 'conference_hall' OR type = 'conference' OR resource_uuid LIKE 'CH-%')`;
      } else if (type === 'vehicle') {
        sql += ` AND (type = 'vehicle' OR type = 'car' OR resource_uuid LIKE 'VH-%')`;
      } else if (type === 'equipment') {
        sql += ` AND (type = 'equipment' OR resource_uuid LIKE 'EQ-%')`;
      } else {
        sql += ' AND type = ?';
        params.push(type);
      }
    }


    if (category) {
      sql += ' AND category = ?';
      params.push(category);
    }

    if (minCapacity) {
      sql += ' AND capacity >= ?';
      params.push(parseInt(minCapacity));
    }

    if (location) {
      sql += ' AND location LIKE ?';
      params.push(`%${location}%`);
    }

    if (search) {
      sql += ' AND (name LIKE ? OR resource_uuid LIKE ? OR location LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    // Staff department restriction check (only restrict if explicitly assigned to another specific department)
    if (req.user && req.user.role === 'staff' && req.user.department) {
      sql += ' AND (department_restriction IS NULL OR department_restriction = "" OR department_restriction = ?)';
      params.push(req.user.department);
    }


    sql += ' ORDER BY id ASC';
    const resources = await query(sql, params);

    // Fetch active & pending bookings to determine 3-color status
    const allBookings = await query(`
      SELECT b.id, b.resource_id, b.booking_ref, b.title, b.start_datetime, b.end_datetime, b.status, 
             u.name as user_name, u.department as user_department
      FROM bookings b
      JOIN users u ON b.user_id = u.id
      WHERE b.status IN ('confirmed', 'pending')
      ORDER BY b.start_datetime ASC
    `);

    const allBlocks = await query(`
      SELECT id, resource_id, reason, start_time, end_time, type
      FROM resource_availability_exceptions
      ORDER BY start_time ASC
    `);

    const formatted = resources.map(r => enrichResourceStatus(r, allBookings, allBlocks));

    res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Helper to determine real-time status (Green = available, Yellow = pending, Red = in_use)
function parseIsoDate(str) {
  if (!str) return null;
  if (str instanceof Date) return str;
  const s = String(str).replace(' ', 'T');
  const d = new Date(s);
  return isNaN(d.getTime()) ? new Date(str) : d;
}

function enrichResourceStatus(r, allBookings = [], allBlocks = []) {
  let parsedFeatures = [];
  try {
    parsedFeatures = typeof r.features === 'string' ? JSON.parse(r.features) : r.features;
  } catch (e) {
    parsedFeatures = [];
  }

  const now = new Date();
  const rBookings = (allBookings || []).filter(b => b.resource_id === r.id);
  const rBlocks = (allBlocks || []).filter(b => b.resource_id === r.id);

  // 1. Maintenance block (GRAY)
  const activeBlock = rBlocks.find(m => {
    const s = parseIsoDate(m.start_time);
    const e = parseIsoDate(m.end_time);
    return s && e && (now < e);
  });

  // 2. Confirmed / In-use booking (RED — Booked)
  const confirmedBk = rBookings.find(b => {
    if (!['confirmed', 'checked_in'].includes(b.status)) return false;
    const e = parseIsoDate(b.end_datetime);
    return e && e > now;
  });

  // 3. Pending booking (YELLOW — Pending Approval)
  const pendingBk = rBookings.find(b => {
    if (b.status !== 'pending') return false;
    const e = parseIsoDate(b.end_datetime);
    return e && e > now;
  });

  // 4. Next upcoming booking
  const upcomingBooking = rBookings
    .filter(b => {
      if (!['confirmed', 'checked_in', 'pending'].includes(b.status)) return false;
      const s = parseIsoDate(b.start_datetime);
      return s && s > now;
    })
    .sort((a, b) => parseIsoDate(a.start_datetime) - parseIsoDate(b.start_datetime))[0] || null;

  let current_status = 'available'; // Green
  let available_after = null;
  let active_booking = null;
  let upcoming_booking = null;

  if (activeBlock || r.is_active === 0 || r.status === 'maintenance' || r.status === 'disabled') {
    current_status = 'maintenance'; // Gray
    available_after = activeBlock ? activeBlock.end_time : null;
    active_booking = {
      title: (activeBlock && activeBlock.reason) || 'Scheduled Maintenance',
      user_name: 'Maintenance Team',
      start_datetime: activeBlock ? activeBlock.start_time : null,
      end_datetime: activeBlock ? activeBlock.end_time : null,
      status: 'maintenance'
    };
  } else if (confirmedBk) {
    current_status = 'in_use'; // Red — Booked
    available_after = confirmedBk.end_datetime;
    active_booking = {
      id: confirmedBk.id,
      booking_ref: confirmedBk.booking_ref,
      title: confirmedBk.title,
      user_name: confirmedBk.user_name,
      department: confirmedBk.user_department,
      start_datetime: confirmedBk.start_datetime,
      end_datetime: confirmedBk.end_datetime,
      status: confirmedBk.status || 'confirmed'
    };
  } else if (pendingBk) {
    current_status = 'pending'; // Yellow — Pending Approval
    available_after = pendingBk.end_datetime;
    active_booking = {
      id: pendingBk.id,
      booking_ref: pendingBk.booking_ref,
      title: pendingBk.title,
      user_name: pendingBk.user_name,
      department: pendingBk.user_department,
      start_datetime: pendingBk.start_datetime,
      end_datetime: pendingBk.end_datetime,
      status: 'pending'
    };
  }

  // Attach upcoming booking info
  if (upcomingBooking) {
    upcoming_booking = {
      id: upcomingBooking.id,
      booking_ref: upcomingBooking.booking_ref,
      title: upcomingBooking.title,
      user_name: upcomingBooking.user_name,
      department: upcomingBooking.user_department,
      start_datetime: upcomingBooking.start_datetime,
      end_datetime: upcomingBooking.end_datetime,
      status: upcomingBooking.status
    };
  }

  return {
    ...r,
    features: parsedFeatures || [],
    current_status,
    available_after,
    active_booking,
    upcoming_booking,
    has_pending_request: !!currentPending
  };
}

// Resource Details
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const resources = await query('SELECT * FROM resources WHERE id = ?', [req.params.id]);
    if (resources.length === 0) return res.status(404).json({ error: 'Resource not found' });
    
    const allBookings = await query(`
      SELECT b.id, b.resource_id, b.booking_ref, b.title, b.start_datetime, b.end_datetime, b.status, 
             u.name as user_name, u.department as user_department
      FROM bookings b
      JOIN users u ON b.user_id = u.id
      WHERE b.resource_id = ? AND b.status IN ('confirmed', 'pending')
      ORDER BY b.start_datetime ASC
    `, [req.params.id]);

    const allBlocks = await query(`
      SELECT id, resource_id, reason, start_time, end_time, type
      FROM resource_availability_exceptions
      WHERE resource_id = ?
      ORDER BY start_time ASC
    `, [req.params.id]);

    const enriched = enrichResourceStatus(resources[0], allBookings, allBlocks);
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Resource Availability for Date Range (FR-010)
router.get('/:id/availability', authenticateToken, async (req, res) => {
  try {
    const { start, end } = req.query;
    if (!start || !end) return res.status(400).json({ error: 'Start and end dates required' });

    const bookings = await query(`
      SELECT b.id, b.booking_ref, b.title, b.start_datetime, b.end_datetime, b.status, b.user_id, u.name as user_name, u.department
      FROM bookings b
      JOIN users u ON b.user_id = u.id
      WHERE b.resource_id = ?
        AND b.status IN ('confirmed', 'pending')
        AND (b.start_datetime < ? AND b.end_datetime > ?)
    `, [req.params.id, end, start]);

    const blocks = await query(`
      SELECT id, reason, start_time, end_time, type
      FROM resource_availability_exceptions
      WHERE resource_id = ?
        AND (start_time < ? AND end_time > ?)
    `, [req.params.id, end, start]);

    res.json({ bookings, maintenanceBlocks: blocks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Next Available Slot & Suggestions (FR-024, FR-025)
router.get('/:id/next-available', authenticateToken, async (req, res) => {
  try {
    const { start, end, duration } = req.query;
    const resourceId = req.params.id;
    const durMin = parseInt(duration || '60');

    const nextSlot = await findNextAvailableSlot(resourceId, start || new Date(), durMin);
    const adjacentSlots = start && end ? await findAdjacentSlots(resourceId, start, end) : [];

    res.json({ nextAvailableSlot: nextSlot, adjacentSlots });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Alternative Resources (FR-024)
router.post('/alternatives', authenticateToken, async (req, res) => {
  try {
    const { resourceId, start, end, minCapacity } = req.body;
    const alternatives = await findAlternativeResources(resourceId, start, end, minCapacity || 1);
    res.json(alternatives);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create Resource (Super Admin & Resource Manager FR-001)
router.post('/', authenticateToken, checkRole(['super_admin', 'resource_manager']), async (req, res) => {
  try {
    const {
      name, type, category, capacity, location, features,
      operating_hours_start, operating_hours_end, min_lead_time_minutes,
      max_duration_minutes, default_duration_minutes, requires_approval,
      requires_checkin, department_restriction, image_url
    } = req.body;

    let prefix = 'RS';
    if (type === 'meeting_room' || type === 'room') prefix = 'MR';
    else if (type === 'conference_hall') prefix = 'CH';
    else if (type === 'training_lab' || type === 'lab') prefix = 'TL';
    else if (type === 'vehicle') prefix = 'VH';
    else if (type === 'equipment') prefix = 'EQ';
    const resourceUuid = `${prefix}-${Math.floor(100 + Math.random() * 900)}`;

    const result = await query(`
      INSERT INTO resources (
        resource_uuid, name, type, category, capacity, location, features,
        operating_hours_start, operating_hours_end, min_lead_time_minutes,
        max_duration_minutes, default_duration_minutes, requires_approval,
        requires_checkin, department_restriction, image_url
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      resourceUuid, name, type, category || 'General', capacity || 1, location || '',
      JSON.stringify(features || []), operating_hours_start || '08:00', operating_hours_end || '18:00',
      min_lead_time_minutes || 60, max_duration_minutes || 240, default_duration_minutes || 60,
      requires_approval ? 1 : 0, requires_checkin ? 1 : 0, department_restriction || null,
      image_url || null
    ]);

    await query(`INSERT INTO audit_logs (user_id, action, details) VALUES (?, 'CREATE_RESOURCE', ?)`,
      [req.user.id, JSON.stringify({ name, resourceUuid })]);

    res.status(201).json({ message: 'Resource created successfully', id: result.insertId, resourceUuid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get All Maintenance Blocks
router.get('/blocks', authenticateToken, async (req, res) => {
  try {
    const blocks = await query(`
      SELECT id, resource_id, start_time, end_time, reason, type
      FROM resource_availability_exceptions
      ORDER BY start_time ASC
    `);
    res.json(blocks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Block Resource for Maintenance (FR-002)
router.post('/:id/block', authenticateToken, checkRole(['super_admin', 'resource_manager', 'department_head']), async (req, res) => {
  try {
    const resourceId = req.params.id;
    const authorized = await isAuthorizedForResource(req.user, resourceId);
    if (!authorized) {
      return res.status(403).json({ error: 'Access denied: you do not manage this resource department' });
    }
    const { startTime, endTime, reason, type } = req.body;

    await query(`
      INSERT INTO resource_availability_exceptions (resource_id, start_time, end_time, reason, type)
      VALUES (?, ?, ?, ?, ?)
    `, [resourceId, startTime, endTime, reason || 'Scheduled Maintenance', type || 'maintenance']);

    await query(`INSERT INTO audit_logs (user_id, action, details) VALUES (?, 'BLOCK_RESOURCE', ?)`,
      [req.user.id, JSON.stringify({ resourceId, startTime, endTime, reason })]);

    req.io.emit('calendar_updated', { resourceId });

    res.json({ message: 'Maintenance block scheduled successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Edit Resource (Super Admin, Resource Manager & Department Head)
router.put('/:id', authenticateToken, checkRole(['super_admin', 'resource_manager', 'department_head']), async (req, res) => {
  try {
    const resourceId = req.params.id;
    const authorized = await isAuthorizedForResource(req.user, resourceId);
    if (!authorized) {
      return res.status(403).json({ error: 'Access denied: you do not manage this resource department' });
    }
    const {
      name, type, category, capacity, location, features,
      operating_hours_start, operating_hours_end, requires_approval,
      requires_checkin, department_restriction, image_url
    } = req.body;

    await query(`
      UPDATE resources SET
        name = COALESCE(?, name),
        type = COALESCE(?, type),
        category = COALESCE(?, category),
        capacity = COALESCE(?, capacity),
        location = COALESCE(?, location),
        features = COALESCE(?, features),
        operating_hours_start = COALESCE(?, operating_hours_start),
        operating_hours_end = COALESCE(?, operating_hours_end),
        requires_approval = COALESCE(?, requires_approval),
        requires_checkin = COALESCE(?, requires_checkin),
        department_restriction = ?,
        image_url = ?
      WHERE id = ?
    `, [
      name, type, category, capacity, location,
      features ? JSON.stringify(features) : null,
      operating_hours_start, operating_hours_end,
      requires_approval !== undefined ? (requires_approval ? 1 : 0) : null,
      requires_checkin !== undefined ? (requires_checkin ? 1 : 0) : null,
      department_restriction !== undefined ? department_restriction : null,
      image_url !== undefined ? (image_url || null) : null,
      resourceId
    ]);

    await query(`INSERT INTO audit_logs (user_id, action, details) VALUES (?, 'EDIT_RESOURCE', ?)`,
      [req.user.id, JSON.stringify({ resourceId, name })]);

    req.io.emit('resource_updated', { resourceId });

    res.json({ message: 'Resource updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete Resource (Super Admin, Resource Manager & Department Head)
router.delete('/:id', authenticateToken, checkRole(['super_admin', 'resource_manager', 'department_head']), async (req, res) => {
  try {
    const resourceId = req.params.id;
    const authorized = await isAuthorizedForResource(req.user, resourceId);
    if (!authorized) {
      return res.status(403).json({ error: 'Access denied: you do not manage this resource department' });
    }

    await query('UPDATE resources SET is_active = 0 WHERE id = ?', [resourceId]);
    await query('DELETE FROM check_ins WHERE booking_id IN (SELECT id FROM bookings WHERE resource_id = ?)', [resourceId]);
    await query('DELETE FROM approvals WHERE booking_id IN (SELECT id FROM bookings WHERE resource_id = ?)', [resourceId]);
    await query('DELETE FROM feedback WHERE booking_id IN (SELECT id FROM bookings WHERE resource_id = ?)', [resourceId]);
    await query('DELETE FROM bookings WHERE resource_id = ?', [resourceId]);

    await query(`INSERT INTO audit_logs (user_id, action, details) VALUES (?, 'DELETE_RESOURCE', ?)`,
      [req.user.id, JSON.stringify({ resourceId })]);

    req.io.emit('resource_deleted', { resourceId });
    req.io.emit('booking_updated', { resourceId, action: 'resource_deleted' });
    req.io.emit('booking_created', { resourceId, action: 'resource_deleted' });

    res.json({ message: 'Resource deactivated and related bookings removed successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


module.exports = router;

