const { query } = require('../config/database');
const { addMinutes, format, parseISO, isBefore, isAfter, differenceInMinutes } = require('date-fns');

/**
 * Checks if a resource is available for the given timeframe.
 * Checks against existing bookings and maintenance exceptions.
 */
async function checkResourceAvailability(resourceId, startDateTime, endDateTime, excludeBookingId = null) {
  const startStr = typeof startDateTime === 'string' ? startDateTime : format(startDateTime, 'yyyy-MM-dd HH:mm:ss');
  const endStr = typeof endDateTime === 'string' ? endDateTime : format(endDateTime, 'yyyy-MM-dd HH:mm:ss');

  // Check existing confirmed/pending/checked_in/on_hold bookings
  let sqlBookings = `
    SELECT id, title, start_datetime, end_datetime, status 
    FROM bookings 
    WHERE resource_id = ? 
      AND status IN ('confirmed', 'pending', 'checked_in', 'on_hold')
      AND (
        (start_datetime < ? AND end_datetime > ?)
      )
  `;
  const paramsBookings = [resourceId, endStr, startStr];

  if (excludeBookingId) {
    sqlBookings += ` AND id != ?`;
    paramsBookings.push(excludeBookingId);
  }

  const conflictingBookings = await query(sqlBookings, paramsBookings);

  // Check maintenance blocks
  const sqlBlocks = `
    SELECT id, reason, start_time, end_time 
    FROM resource_availability_exceptions 
    WHERE resource_id = ? 
      AND (start_time < ? AND end_time > ?)
  `;
  const conflictingBlocks = await query(sqlBlocks, [resourceId, endStr, startStr]);

  const isAvailable = conflictingBookings.length === 0 && conflictingBlocks.length === 0;

  return {
    isAvailable,
    conflictingBookings,
    conflictingBlocks
  };
}

/**
 * Checks Business Rule BR-001: Staff cannot book more than 2 meetings simultaneously
 */
async function checkUserSimultaneousLimit(userId, startDateTime, endDateTime) {
  const startStr = typeof startDateTime === 'string' ? startDateTime : format(startDateTime, 'yyyy-MM-dd HH:mm:ss');
  const endStr = typeof endDateTime === 'string' ? endDateTime : format(endDateTime, 'yyyy-MM-dd HH:mm:ss');

  const userBookings = await query(`
    SELECT COUNT(*) as count 
    FROM bookings 
    WHERE user_id = ? 
      AND status IN ('confirmed', 'pending', 'checked_in', 'on_hold')
      AND (start_datetime < ? AND end_datetime > ?)
  `, [userId, endStr, startStr]);

  return userBookings[0].count >= 2;
}

/**
 * Finds the Next Available Time Slot for a given resource after the requested start time.
 */
async function findNextAvailableSlot(resourceId, requestedStart, durationMinutes = 60) {
  let candidateStart = new Date(requestedStart);
  const maxSearchDays = 7;
  const stepMinutes = 30;
  let iterations = 0;

  while (iterations < (maxSearchDays * 24 * 2)) {
    const candidateEnd = addMinutes(candidateStart, durationMinutes);
    const { isAvailable } = await checkResourceAvailability(resourceId, candidateStart, candidateEnd);

    if (isAvailable) {
      return {
        start: format(candidateStart, 'yyyy-MM-dd HH:mm:ss'),
        end: format(candidateEnd, 'yyyy-MM-dd HH:mm:ss')
      };
    }

    candidateStart = addMinutes(candidateStart, stepMinutes);
    iterations++;
  }

  return null;
}

/**
 * Suggests adjacent slots (e.g. 30/60 mins before or after)
 */
async function findAdjacentSlots(resourceId, requestedStart, requestedEnd) {
  const reqStart = new Date(requestedStart);
  const reqEnd = new Date(requestedEnd);
  const durationMin = differenceInMinutes(reqEnd, reqStart);

  const options = [];

  // Try 30 mins earlier
  const earlierStart = addMinutes(reqStart, -30);
  const earlierEnd = addMinutes(earlierStart, durationMin);
  const resEarlier = await checkResourceAvailability(resourceId, earlierStart, earlierEnd);
  if (resEarlier.isAvailable && isAfter(earlierStart, new Date())) {
    options.push({
      label: `30 mins earlier (${format(earlierStart, 'HH:mm')} - ${format(earlierEnd, 'HH:mm')})`,
      start: format(earlierStart, 'yyyy-MM-dd HH:mm:ss'),
      end: format(earlierEnd, 'yyyy-MM-dd HH:mm:ss')
    });
  }

  // Try 30 mins later
  const laterStart = addMinutes(reqStart, 30);
  const laterEnd = addMinutes(laterStart, durationMin);
  const resLater = await checkResourceAvailability(resourceId, laterStart, laterEnd);
  if (resLater.isAvailable) {
    options.push({
      label: `30 mins later (${format(laterStart, 'HH:mm')} - ${format(laterEnd, 'HH:mm')})`,
      start: format(laterStart, 'yyyy-MM-dd HH:mm:ss'),
      end: format(laterEnd, 'yyyy-MM-dd HH:mm:ss')
    });
  }

  return options;
}

/**
 * Finds alternative available resources of the same type/category
 */
async function findAlternativeResources(targetResourceId, startDateTime, endDateTime, minCapacity = 1) {
  const currentRes = (await query('SELECT type, category FROM resources WHERE id = ?', [targetResourceId]))[0];
  if (!currentRes) return [];

  const alternatives = await query(`
    SELECT r.id, r.resource_uuid, r.name, r.type, r.category, r.capacity, r.location, r.image_url, r.requires_approval
    FROM resources r
    WHERE r.id != ? 
      AND r.type = ? 
      AND r.capacity >= ? 
      AND r.is_active = 1
  `, [targetResourceId, currentRes.type, minCapacity]);

  const availableAlternatives = [];

  for (const alt of alternatives) {
    const { isAvailable } = await checkResourceAvailability(alt.id, startDateTime, endDateTime);
    if (isAvailable) {
      availableAlternatives.push(alt);
    }
  }

  return availableAlternatives;
}

module.exports = {
  checkResourceAvailability,
  checkUserSimultaneousLimit,
  findNextAvailableSlot,
  findAdjacentSlots,
  findAlternativeResources
};
