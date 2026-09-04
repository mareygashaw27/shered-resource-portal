const { query } = require('./config/database');

async function check() {
  try {
    // Try to get table info
    const bks = await query("SELECT id, booking_ref, resource_id, title, start_datetime, end_datetime, status FROM bookings");
    console.log("=== ALL BOOKINGS IN DATABASE ===");
    console.log(JSON.stringify(bks, null, 2));
    const res = await query("SELECT id, name, resource_uuid FROM resources WHERE id <= 3");
    console.log("=== SAMPLE RESOURCES ===");
    console.log(JSON.stringify(res, null, 2));
  } catch (err) {
    console.error("Error inspecting database:", err);
  }
  process.exit(0);
}

check();
