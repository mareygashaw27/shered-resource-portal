const { query } = require('./config/database');

async function check() {
  try {
    // Try to get table info
    console.log("Checking users table structure...");
    let result;
    try {
      result = await query("DESCRIBE users");
      console.log("MySQL users table structure:", result);
    } catch (e) {
      result = await query("PRAGMA table_info(users)");
      console.log("SQLite users table structure:", result);
    }
  } catch (err) {
    console.error("Error inspecting database:", err);
  }
  process.exit(0);
}

check();
