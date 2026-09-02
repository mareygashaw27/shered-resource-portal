const express = require('express');
const router = express.Router();
const { query, getIsMySQL } = require('../config/database');
const { authenticateToken, checkRole } = require('../middleware/auth');
const { Parser } = require('json2csv');

// Helper to compute duration in hours between start and end
function getDurationHours(startStr, endStr) {
  const s = new Date(startStr);
  const e = new Date(endStr);
  return Math.max(0, (e - s) / (1000 * 60 * 60));
}

// Dashboard KPI Cards (FR-046) — scoped by role
// super_admin / resource_manager / auditor → system-wide stats
// department_head → stats for their department only
// staff → stats for their own bookings only
router.get('/kpis', authenticateToken, async (req, res) => {
  try {
    let resourceSql = 'SELECT COUNT(*) as count FROM resources WHERE is_active = 1 OR is_active IS NULL';
    const rParams = [];
    if (req.user.role === 'staff') {
      resourceSql += ' AND (department_restriction IS NULL OR department_restriction = ?)';
      rParams.push(req.user.department);
    }
    const resCountRows = await query(resourceSql, rParams);
    const totalResources = parseInt(resCountRows[0]?.count || resCountRows[0]?.['COUNT(*)'] || 0);

    // Fetch bookings scoped to role
    let bookingsSql = `SELECT b.id, b.status, b.start_datetime, b.end_datetime, u.department, r.type as resource_type
      FROM bookings b
      JOIN users u ON b.user_id = u.id
      JOIN resources r ON b.resource_id = r.id
      WHERE b.status NOT IN ('cancelled')`;
    const bParams = [];

    if (req.user.role === 'staff') {
      bookingsSql += ` AND (b.user_id = ? OR b.booked_for_user_id = ?)`;
      bParams.push(req.user.id, req.user.id);
    }

    const allBookings = await query(bookingsSql, bParams);

    const now = new Date();
    const todayYMD = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    let totalBookingsToday = 0;
    let totalBookingsWeek = 0;
    let noShowBookings = 0;
    let hoursBookedToday = 0;

    allBookings.forEach(b => {
      const s = new Date(b.start_datetime);
      const e = new Date(b.end_datetime);
      const sYMD = !isNaN(s.getTime()) ? `${s.getFullYear()}-${String(s.getMonth() + 1).padStart(2, '0')}-${String(s.getDate()).padStart(2, '0')}` : '';
      const eYMD = !isNaN(e.getTime()) ? `${e.getFullYear()}-${String(e.getMonth() + 1).padStart(2, '0')}-${String(e.getDate()).padStart(2, '0')}` : '';

      // Count if starts today, ends today, or active today
      if (sYMD === todayYMD || eYMD === todayYMD || (s <= now && e >= now)) {
        totalBookingsToday++;
      }

      if (s >= sevenDaysAgo) {
        totalBookingsWeek++;
      }

      if (b.status === 'no_show') {
        noShowBookings++;
      }

      if (['confirmed', 'completed', 'checked_in'].includes(b.status)) {
        const durHours = Math.max(0.5, (e - s) / (1000 * 60 * 60));
        if (sYMD === todayYMD || (s <= now && e >= now)) {
          hoursBookedToday += durHours;
        }
      }
    });

    // Pending Approvals count from database
    const pendingRows = await query("SELECT COUNT(*) as count FROM bookings WHERE status = 'pending'");
    const pendingApprovals = parseInt(pendingRows[0]?.count || pendingRows[0]?.['COUNT(*)'] || 0);

    const totalBookingsAll = allBookings.length;
    const noShowRateVal = totalBookingsAll > 0 ? ((noShowBookings / totalBookingsAll) * 100).toFixed(1) : '0.0';
    
    // Utilization Rate = (Hours booked today / Total available resource hours today [10 hours/day]) * 100
    const dailyOperatingHours = Math.max(1, totalResources) * 10;
    const utilizationPct = dailyOperatingHours > 0 ? Math.min(100, (hoursBookedToday / dailyOperatingHours) * 100) : 0;

    res.json({
      totalResources,
      totalBookingsToday,
      totalBookingsWeek,
      pendingApprovals,
      noShowRate: `${noShowRateVal}%`,
      utilizationRate: `${utilizationPct.toFixed(1)}%`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Resource Utilization Reports (FR-047)
router.get('/utilization', authenticateToken, checkRole(['super_admin', 'resource_manager', 'department_head', 'auditor']), async (req, res) => {
  try {
    const resources = await query('SELECT id, name, type, category, location FROM resources WHERE is_active = 1');
    const bookings = await query(`
      SELECT b.resource_id, b.start_datetime, b.end_datetime, u.department, r.type as resource_type
      FROM bookings b
      JOIN users u ON b.user_id = u.id
      JOIN resources r ON b.resource_id = r.id
      WHERE b.status IN ('confirmed', 'completed')
    `);

    // Filter bookings if Department Head
    const filteredBookings = req.user.role === 'department_head'
      ? bookings.filter(b => {
          const dept = (req.user.department || '').toLowerCase();
          if (dept.includes('meeting room') || dept.includes('room')) return b.resource_type === 'meeting_room' || b.resource_type === 'room';
          if (dept.includes('conference')) return b.resource_type === 'conference_hall';
          if (dept.includes('training') || dept.includes('lab')) return b.resource_type === 'training_lab' || b.resource_type === 'lab';
          if (dept.includes('vehicle') || dept.includes('fleet')) return b.resource_type === 'vehicle';
          if (dept.includes('equipment')) return b.resource_type === 'equipment';
          return b.department === req.user.department;
        })
      : bookings;

    const resourceMap = {};
    resources.forEach(r => {
      resourceMap[r.id] = { ...r, total_bookings: 0, total_hours_booked: 0 };
    });

    const categoryMap = {};

    filteredBookings.forEach(b => {
      const dur = getDurationHours(b.start_datetime, b.end_datetime);
      if (resourceMap[b.resource_id]) {
        resourceMap[b.resource_id].total_bookings += 1;
        resourceMap[b.resource_id].total_hours_booked += dur;

        const cat = resourceMap[b.resource_id].category || 'General';
        if (!categoryMap[cat]) categoryMap[cat] = { category: cat, total_bookings: 0, total_hours: 0 };
        categoryMap[cat].total_bookings += 1;
        categoryMap[cat].total_hours += dur;
      }
    });

    const perResource = Object.values(resourceMap).sort((a, b) => b.total_hours_booked - a.total_hours_booked);
    const perCategory = Object.values(categoryMap);

    res.json({ perResource, perCategory });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Department Usage Report (FR-049)
router.get('/department-usage', authenticateToken, checkRole(['super_admin', 'resource_manager', 'department_head', 'auditor']), async (req, res) => {
  try {
    let sql = `
      SELECT u.department, b.start_datetime, b.end_datetime, r.type as resource_type
      FROM users u
      JOIN bookings b ON u.id = b.user_id
      JOIN resources r ON b.resource_id = r.id
      WHERE b.status IN ('confirmed', 'completed')
    `;
    const params = [];

    if (req.user.role === 'department_head') {
      const dept = (req.user.department || '').toLowerCase();
      if (dept.includes('meeting room') || dept.includes('room')) {
        sql += ` AND (r.type = 'meeting_room' OR r.type = 'room')`;
      } else if (dept.includes('conference')) {
        sql += ` AND r.type = 'conference_hall'`;
      } else if (dept.includes('training') || dept.includes('lab')) {
        sql += ` AND (r.type = 'training_lab' OR r.type = 'lab')`;
      } else if (dept.includes('vehicle') || dept.includes('fleet')) {
        sql += ` AND r.type = 'vehicle'`;
      } else if (dept.includes('equipment')) {
        sql += ` AND r.type = 'equipment'`;
      } else {
        sql += ` AND u.department = ?`;
        params.push(req.user.department);
      }
    }

    const rows = await query(sql, params);
    const deptMap = {};

    rows.forEach(r => {
      const d = r.department || 'Other';
      const dur = getDurationHours(r.start_datetime, r.end_datetime);
      if (!deptMap[d]) deptMap[d] = { department: d, total_bookings: 0, total_hours: 0 };
      deptMap[d].total_bookings += 1;
      deptMap[d].total_hours += dur;
    });

    const deptUsage = Object.values(deptMap).sort((a, b) => b.total_hours - a.total_hours);
    res.json(deptUsage);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Full Audit Logs (FR-050)
router.get('/audit-logs', authenticateToken, checkRole(['super_admin', 'auditor']), async (req, res) => {
  try {
    const logs = await query(`
      SELECT a.*, u.name as user_name, u.email as user_email, u.role as user_role
      FROM audit_logs a
      LEFT JOIN users u ON a.user_id = u.id
      ORDER BY a.timestamp DESC
      LIMIT 100
    `);
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// CSV Export (FR-050)
router.get('/export-csv', authenticateToken, checkRole(['super_admin', 'resource_manager', 'department_head', 'auditor']), async (req, res) => {
  try {
    const data = await query(`
      SELECT b.booking_ref, r.name as resource_name, r.type as resource_type, u.name as booked_by,
             u.department, b.title, b.start_datetime, b.end_datetime, b.status, b.created_at
      FROM bookings b
      JOIN resources r ON b.resource_id = r.id
      JOIN users u ON b.user_id = u.id
      ORDER BY b.created_at DESC
    `);

    const json2csvParser = new Parser();
    const csv = json2csvParser.parse(data);

    res.header('Content-Type', 'text/csv');
    res.attachment(`resource_bookings_report_${Date.now()}.csv`);
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

