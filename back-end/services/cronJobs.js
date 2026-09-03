const cron = require('node-cron');
const { query } = require('../config/database');
const { format, addDays } = require('date-fns');
const { sendNoShowCancellation, sendWaitlistOffer } = require('./emailService');


function initCronJobs(io) {
  console.log('[Cron] Initializing background tasks (No-show auto-cancellation & SLA tracking)...');

  // Run every 5 minutes (real grace period check — not too aggressive)
  cron.schedule('*/5 * * * *', async () => {
    try {
      await processNoShowCancellations(io);
      await processWaitlistExpirations(io);
    } catch (err) {
      console.error('[Cron Error]', err);
    }
  });
}

async function processNoShowCancellations(io) {
  const fifteenMinutesAgo = format(new Date(Date.now() - 15 * 60 * 1000), 'yyyy-MM-dd HH:mm:ss');

  // Find bookings where start_datetime <= now - 15 minutes AND status = 'confirmed'
  // AND resource requires checkin AND no record in check_ins
  const expiredBookings = await query(`
    SELECT b.id, b.resource_id, b.user_id, b.title, b.start_datetime, b.end_datetime, u.name as user_name, u.email as user_email, u.no_show_count
    FROM bookings b
    JOIN resources r ON b.resource_id = r.id
    JOIN users u ON b.user_id = u.id
    LEFT JOIN check_ins c ON b.id = c.booking_id
    WHERE b.status = 'confirmed'
      AND r.requires_checkin = 1
      AND c.id IS NULL
      AND b.start_datetime <= ?
  `, [fifteenMinutesAgo]);

  for (const bk of expiredBookings) {
    console.log(`[Cron No-Show] Auto-cancelling booking #${bk.id} (${bk.title}) for user ${bk.user_name} due to missed grace period.`);

    // Update booking status to no_show
    await query(`UPDATE bookings SET status = 'no_show', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [bk.id]);

    const newCount = (bk.no_show_count || 0) + 1;
    await query(`UPDATE users SET no_show_count = ?, penalty_suspended_until = NULL WHERE id = ?`, [newCount, bk.user_id]);
    await query(`INSERT INTO no_show_penalties (user_id, booking_id, penalty_count) VALUES (?, ?, ?)`, 
      [bk.user_id, bk.id, newCount]);

    // Send No-Show Email Notification
    if (bk.user_email) {
      sendNoShowCancellation(bk.user_email, bk, newCount).catch(e => console.error('[Email Error]', e.message));
    }

    // Audit Log
    await query(`INSERT INTO audit_logs (user_id, action, booking_id, details) VALUES (?, 'AUTO_CANCEL_NO_SHOW', ?, ?)`,
      [bk.user_id, bk.id, JSON.stringify({ reason: 'Missed 15 min check-in grace period', newNoShowCount: newCount, suspendedUntil: null })]);

    // Notify via Socket.io
    if (io) {
      io.emit('booking_updated', { bookingId: bk.id, resourceId: bk.resource_id, status: 'no_show' });
      io.emit('notification', {
        userId: bk.user_id,
        title: 'Booking Auto-Cancelled (No-Show)',
        message: `Your booking for "${bk.title}" was cancelled due to no check-in within the 15-minute grace period. No-show count: ${newCount}/3.`
      });
    }

    // Check waitlist for this resource and promote top waiting request
    await promoteNextWaitlistedUser(bk.resource_id, bk.start_datetime, bk.end_datetime, io);
  }
}

async function promoteNextWaitlistedUser(resourceId, startDateTime, endDateTime, io) {
  const waitlisted = await query(`
    SELECT w.id, w.requested_by, w.desired_start, w.desired_end, u.name, u.email
    FROM waitlist w
    JOIN users u ON w.requested_by = u.id
    WHERE w.resource_id = ? AND w.status = 'waiting'
    ORDER BY w.created_at ASC
    LIMIT 1
  `, [resourceId]);

  if (waitlisted.length > 0) {
    const entry = waitlisted[0];
    const nowStr = format(new Date(), 'yyyy-MM-dd HH:mm:ss');

    await query(`UPDATE waitlist SET status = 'offered', notified_at = ? WHERE id = ?`, [nowStr, entry.id]);

    if (entry.email) {
      sendWaitlistOffer(entry.email, entry).catch(e => console.error('[Email Error]', e.message));
    }

    await query(`INSERT INTO audit_logs (user_id, action, details) VALUES (?, 'WAITLIST_OFFERED', ?)`,
      [entry.requested_by, JSON.stringify({ waitlistId: entry.id, resourceId })]);

    if (io) {
      io.emit('notification', {
        userId: entry.requested_by,
        title: 'Resource Slot Available!',
        message: `A slot for your waitlisted resource is now available! You have 24 hours to accept the booking.`
      });
    }
  }
}

async function processWaitlistExpirations(io) {
  // Expire offers older than 24 hours
  const twentyFourHoursAgo = format(new Date(Date.now() - 24 * 60 * 60 * 1000), 'yyyy-MM-dd HH:mm:ss');
  const expiredOffers = await query(`
    SELECT id, resource_id, requested_by FROM waitlist 
    WHERE status = 'offered' 
      AND notified_at <= ?
  `, [twentyFourHoursAgo]);

  for (const offer of expiredOffers) {
    await query(`UPDATE waitlist SET status = 'expired' WHERE id = ?`, [offer.id]);
    await promoteNextWaitlistedUser(offer.resource_id, null, null, io);
  }
}

module.exports = {
  initCronJobs
};
