const mysql = require('mysql2/promise');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

let pool = null;
let sqliteDb = null;
let isMySQL = false;

// MySQL Config
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'shered_res',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

const defaultAccounts = [
  { name: 'Marey Gashaw', email: 'mareygashaw21@gmail.com', password: 'mar2121@', role: 'super_admin', department: 'Executive Office' },
  { name: 'Resource Manager', email: 'manager.sharedres@gmail.com', password: 'manager123', role: 'resource_manager', department: 'Operations' },
  { name: 'Meeting Room Dept Head', email: 'head.meetingroom@gmail.com', password: 'head123', role: 'department_head', department: 'Meeting Rooms Department' },
  { name: 'Conference Hall Dept Head', email: 'head.confhall@gmail.com', password: 'head123', role: 'department_head', department: 'Conference Halls Department' },
  { name: 'Training Lab Dept Head', email: 'head.trainlab@gmail.com', password: 'head123', role: 'department_head', department: 'Training Labs Department' },
  { name: 'Vehicle Dept Head', email: 'head.vehiclefleet@gmail.com', password: 'head123', role: 'department_head', department: 'Vehicles Department' },
  { name: 'Equipment Dept Head', email: 'head.equipments@gmail.com', password: 'head123', role: 'department_head', department: 'Equipment Department' },
  { name: 'Staff Member', email: 'staff.member2026@gmail.com', password: 'staff123', role: 'staff', department: 'IT Department' },
  { name: 'System Auditor', email: 'auditor.system2026@gmail.com', password: 'auditor123', role: 'auditor', department: 'Internal Audit' }
];

async function initDatabase() {
  try {
    // Attempt MySQL connection
    const connection = await mysql.createConnection({
      host: dbConfig.host,
      user: dbConfig.user,
      password: dbConfig.password
    });

    // Create database if not exists
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\`;`);
    await connection.end();

    // Create pool
    pool = mysql.createPool(dbConfig);
    
    // Test connection
    const testConn = await pool.getConnection();
    await testConn.ping();
    testConn.release();

    isMySQL = true;
    console.log(`[DB] Connected successfully to MySQL database "${dbConfig.database}" on ${dbConfig.host}`);
    
    await createMySQLTables();
    await seedInitialData();
  } catch (err) {
    console.warn(`[DB Warning] Could not connect to MySQL (${err.message}). Falling back to SQLite database for seamless operation.`);
    
    // Fallback SQLite setup
    const dbPath = path.join(__dirname, '..', 'shered_res.sqlite');
    sqliteDb = new Database(dbPath);
    sqliteDb.pragma('journal_mode = WAL');
    isMySQL = false;
    
    createSQLiteTables();
    seedSQLiteInitialData();
    console.log(`[DB] Using SQLite fallback database at ${dbPath}`);
  }

  // Always ensure all default admin and role accounts exist and have valid passwords regardless of DB engine
  await ensureDefaultUsersAndRoles();
}

// Unified Execute Helper
async function query(sql, params = []) {
  if (isMySQL) {
    const [rows] = await pool.execute(sql, params);
    return rows;
  } else {
    // Execute SQLite statement
    const stmt = sqliteDb.prepare(sql);
    if (sql.trim().toUpperCase().startsWith('SELECT')) {
      return stmt.all(...params);
    } else {
      const info = stmt.run(...params);
      return { insertId: info.lastInsertRowid, affectedRows: info.changes };
    }
  }
}


async function createMySQLTables() {
  const tables = [
    `CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(150) NOT NULL UNIQUE,
      password VARCHAR(255) NULL,
      role ENUM('super_admin', 'resource_manager', 'department_head', 'staff', 'auditor') NOT NULL DEFAULT 'staff',
      department VARCHAR(100) NOT NULL,
      no_show_count INT DEFAULT 0,
      penalty_suspended_until DATETIME NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS resources (
      id INT AUTO_INCREMENT PRIMARY KEY,
      resource_uuid VARCHAR(50) NOT NULL UNIQUE,
      name VARCHAR(150) NOT NULL,
      type ENUM('meeting_room', 'conference_hall', 'training_lab', 'vehicle', 'equipment', 'room', 'lab') NOT NULL,
      category VARCHAR(100) NOT NULL,
      capacity INT NOT NULL DEFAULT 1,
      location VARCHAR(200) NOT NULL,
      features JSON NULL,
      operating_hours_start VARCHAR(10) DEFAULT '08:00',
      operating_hours_end VARCHAR(10) DEFAULT '18:00',
      min_lead_time_minutes INT DEFAULT 60,
      max_duration_minutes INT DEFAULT 240,
      default_duration_minutes INT DEFAULT 60,
      requires_approval TINYINT(1) DEFAULT 0,
      requires_checkin TINYINT(1) DEFAULT 1,
      is_active TINYINT(1) DEFAULT 1,
      department_restriction VARCHAR(100) NULL,
      image_url LONGTEXT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS resource_availability_exceptions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      resource_id INT NOT NULL,
      start_time DATETIME NOT NULL,
      end_time DATETIME NOT NULL,
      reason VARCHAR(255) NOT NULL,
      type ENUM('maintenance', 'out_of_service', 'blocked') DEFAULT 'maintenance',
      FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS bookings (
      id INT AUTO_INCREMENT PRIMARY KEY,
      booking_ref VARCHAR(50) NOT NULL UNIQUE,
      resource_id INT NOT NULL,
      user_id INT NOT NULL,
      booked_for_user_id INT NULL,
      title VARCHAR(200) NOT NULL,
      start_datetime DATETIME NOT NULL,
      end_datetime DATETIME NOT NULL,
      is_recurring TINYINT(1) DEFAULT 0,
      recurrence_rule VARCHAR(100) NULL,
      attendees INT DEFAULT 1,
      special_requirements TEXT NULL,
      status ENUM('pending', 'confirmed', 'completed', 'cancelled', 'no_show', 'rejected') DEFAULT 'confirmed',
      check_in_deadline DATETIME NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS booking_occurrences (
      id INT AUTO_INCREMENT PRIMARY KEY,
      booking_id INT NOT NULL,
      occurrence_start DATETIME NOT NULL,
      occurrence_end DATETIME NOT NULL,
      status VARCHAR(50) DEFAULT 'confirmed',
      FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS check_ins (
      id INT AUTO_INCREMENT PRIMARY KEY,
      booking_id INT NOT NULL,
      checked_in_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      checked_out_at DATETIME NULL,
      check_in_method ENUM('web', 'qr', 'manual') DEFAULT 'web',
      FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS approvals (
      id INT AUTO_INCREMENT PRIMARY KEY,
      booking_id INT NOT NULL,
      approver_id INT NOT NULL,
      status ENUM('pending', 'approved', 'rejected', 'hold') DEFAULT 'pending',
      reason TEXT NULL,
      approved_at DATETIME NULL,
      FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS waitlist (
      id INT AUTO_INCREMENT PRIMARY KEY,
      resource_id INT NOT NULL,
      requested_by INT NOT NULL,
      desired_start DATETIME NOT NULL,
      desired_end DATETIME NOT NULL,
      status ENUM('waiting', 'offered', 'accepted', 'expired') DEFAULT 'waiting',
      notified_at DATETIME NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE,
      FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS no_show_penalties (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      booking_id INT NOT NULL,
      penalty_count INT DEFAULT 1,
      penalty_start DATETIME DEFAULT CURRENT_TIMESTAMP,
      penalty_end DATETIME NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS feedback (
      id INT AUTO_INCREMENT PRIMARY KEY,
      booking_id INT NOT NULL,
      rating INT CHECK (rating >= 1 AND rating <= 5),
      comment TEXT NULL,
      submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS audit_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NULL,
      action VARCHAR(100) NOT NULL,
      booking_id INT NULL,
      details JSON NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`
  ];

  for (const sql of tables) {
    await pool.query(sql);
  }
  try {
    await pool.query("ALTER TABLE users MODIFY COLUMN role ENUM('super_admin', 'resource_manager', 'department_head', 'staff', 'auditor') NOT NULL DEFAULT 'staff';");
  } catch (e) {}
  try {
    await pool.query('ALTER TABLE users ADD COLUMN password VARCHAR(255) NULL;');
  } catch (e) {}
  try {
    await pool.query('ALTER TABLE users ADD COLUMN reset_token VARCHAR(255) NULL;');
  } catch (e) {}
  try {
    await pool.query('ALTER TABLE users ADD COLUMN reset_token_expires DATETIME NULL;');
  } catch (e) {}
  try {
    await pool.query('ALTER TABLE resources MODIFY image_url LONGTEXT;');
  } catch (e) {}
}

function createSQLiteTables() {
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password TEXT NULL,
      role TEXT NOT NULL DEFAULT 'staff',
      department TEXT NOT NULL,
      no_show_count INTEGER DEFAULT 0,
      penalty_suspended_until TEXT NULL,
      reset_token TEXT NULL,
      reset_token_expires TEXT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);
  try {
    sqliteDb.exec('ALTER TABLE users ADD COLUMN password TEXT;');
  } catch (e) {}
  try {
    sqliteDb.exec('ALTER TABLE users ADD COLUMN reset_token TEXT;');
  } catch (e) {}
  try {
    sqliteDb.exec('ALTER TABLE users ADD COLUMN reset_token_expires TEXT;');
  } catch (e) {}
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS resources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      resource_uuid TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      category TEXT NOT NULL,
      capacity INTEGER NOT NULL DEFAULT 1,
      location TEXT NOT NULL,
      features TEXT NULL,
      operating_hours_start TEXT DEFAULT '08:00',
      operating_hours_end TEXT DEFAULT '18:00',
      min_lead_time_minutes INTEGER DEFAULT 60,
      max_duration_minutes INTEGER DEFAULT 240,
      default_duration_minutes INTEGER DEFAULT 60,
      requires_approval INTEGER DEFAULT 0,
      requires_checkin INTEGER DEFAULT 1,
      is_active INTEGER DEFAULT 1,
      department_restriction TEXT NULL,
      image_url TEXT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS resource_availability_exceptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      resource_id INTEGER NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      reason TEXT NOT NULL,
      type TEXT DEFAULT 'maintenance'
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_ref TEXT NOT NULL UNIQUE,
      resource_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      booked_for_user_id INTEGER NULL,
      title TEXT NOT NULL,
      start_datetime TEXT NOT NULL,
      end_datetime TEXT NOT NULL,
      is_recurring INTEGER DEFAULT 0,
      recurrence_rule TEXT NULL,
      attendees INTEGER DEFAULT 1,
      special_requirements TEXT NULL,
      status TEXT DEFAULT 'confirmed',
      check_in_deadline TEXT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS booking_occurrences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id INTEGER NOT NULL,
      occurrence_start TEXT NOT NULL,
      occurrence_end TEXT NOT NULL,
      status TEXT DEFAULT 'confirmed'
    );

    CREATE TABLE IF NOT EXISTS check_ins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id INTEGER NOT NULL,
      checked_in_at TEXT DEFAULT CURRENT_TIMESTAMP,
      checked_out_at TEXT NULL,
      check_in_method TEXT DEFAULT 'web'
    );

    CREATE TABLE IF NOT EXISTS approvals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id INTEGER NOT NULL,
      approver_id INTEGER NOT NULL,
      status TEXT DEFAULT 'pending',
      reason TEXT NULL,
      approved_at TEXT NULL
    );

    CREATE TABLE IF NOT EXISTS waitlist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      resource_id INTEGER NOT NULL,
      requested_by INTEGER NOT NULL,
      desired_start TEXT NOT NULL,
      desired_end TEXT NOT NULL,
      status TEXT DEFAULT 'waiting',
      notified_at TEXT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS no_show_penalties (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      booking_id INTEGER NOT NULL,
      penalty_count INTEGER DEFAULT 1,
      penalty_start TEXT DEFAULT CURRENT_TIMESTAMP,
      penalty_end TEXT NULL
    );

    CREATE TABLE IF NOT EXISTS feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id INTEGER NOT NULL,
      rating INTEGER,
      comment TEXT NULL,
      submitted_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NULL,
      action TEXT NOT NULL,
      booking_id INTEGER NULL,
      details TEXT NULL,
      timestamp TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

async function seedInitialData() {
  const usersCount = (await query('SELECT COUNT(*) as count FROM users'))[0].count;
  if (usersCount === 0) {
    console.log('[DB] Seeding initial users and resources...');
    
    // Seed Users for all 5 Roles + 5 Resource Type Department Heads with Registered Passwords
    await query(`INSERT INTO users (name, email, password, role, department) VALUES 
      ('Marey Gashaw', 'mareygashaw21@gmail.com', 'mar2121@', 'super_admin', 'Executive Office'),
      ('Resource Manager', 'manager.sharedres@gmail.com', 'manager123', 'resource_manager', 'Operations'),
      ('Meeting Room Dept Head', 'head.meetingroom@gmail.com', 'head123', 'department_head', 'Meeting Rooms Department'),
      ('Conference Hall Dept Head', 'head.confhall@gmail.com', 'head123', 'department_head', 'Conference Halls Department'),
      ('Training Lab Dept Head', 'head.trainlab@gmail.com', 'head123', 'department_head', 'Training Labs Department'),
      ('Vehicle Dept Head', 'head.vehiclefleet@gmail.com', 'head123', 'department_head', 'Vehicles Department'),
      ('Equipment Dept Head', 'head.equipments@gmail.com', 'head123', 'department_head', 'Equipment Department'),
      ('Staff Member', 'staff.member2026@gmail.com', 'staff123', 'staff', 'IT Department'),
      ('System Auditor', 'auditor.system2026@gmail.com', 'auditor123', 'auditor', 'Internal Audit')
    `);

    // Seed Resources
    const features1 = JSON.stringify(['Projector', 'Whiteboard', 'Video Conferencing', 'WiFi']);
    const features2 = JSON.stringify(['GPS', 'Automatic Transmission', 'Dashcam', 'Air Conditioning']);
    const features3 = JSON.stringify(['High-spec PCs', 'Smartboard', 'Dual Monitors']);

    await query(`INSERT INTO resources (resource_uuid, name, type, category, capacity, location, features, operating_hours_start, operating_hours_end, requires_approval, requires_checkin, department_restriction, image_url) VALUES
      ('CH-101', 'Executive Conference Room A', 'conference_hall', 'Conference Halls', 16, 'Building A - Floor 3', '${features1}', '08:00', '18:00', 1, 1, NULL, 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=800&q=80'),
      ('TL-102', 'Innovation Lab 2', 'training_lab', 'Training Labs', 25, 'Building B - Floor 1', '${features3}', '08:00', '20:00', 1, 1, 'IT Department', 'https://images.unsplash.com/photo-1517502884422-41eaead166d4?auto=format&fit=crop&w=800&q=80'),
      ('MR-103', 'Huddle Pod B', 'meeting_room', 'Meeting Rooms', 6, 'Building A - Floor 2', '${features1}', '08:00', '18:00', 1, 1, NULL, 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=800&q=80'),
      ('VH-201', 'Toyota RAV4 SUV (Fleet #1)', 'vehicle', 'SUVs', 5, 'Parking Bay 4B', '${features2}', '06:00', '22:00', 1, 1, NULL, 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=800&q=80'),
      ('VH-202', 'Honda Civic Sedan (Fleet #2)', 'vehicle', 'Sedan Vehicles', 5, 'Parking Bay 2A', '${features2}', '07:00', '19:00', 1, 1, NULL, 'https://images.unsplash.com/photo-1590362891991-f776e747a588?auto=format&fit=crop&w=800&q=80'),
      ('EQ-301', 'Portable 4K Projector & Screen', 'equipment', 'Presentation Gear', 1, 'IT Storage Rm 104', '${JSON.stringify(['HDMI', 'Wireless Screen Share'])}', '08:00', '18:00', 1, 0, NULL, 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?auto=format&fit=crop&w=800&q=80')
    `);
    await query('UPDATE resources SET requires_approval = 1');
    await seedSampleBookings();
  } else {
    try {
      await query("DELETE FROM users WHERE email LIKE '%@organization.org'");
      await query("INSERT INTO users (name, email, password, role, department) VALUES ('Marey Gashaw', 'mareygashaw21@gmail.com', 'mar2121@', 'super_admin', 'Executive Office') ON DUPLICATE KEY UPDATE password = 'mar2121@', role = 'super_admin'");
    } catch(e) {}
    await query('UPDATE resources SET requires_approval = 1');
    await seedSampleBookings();
  }
}

function seedSQLiteInitialData() {
  const row = sqliteDb.prepare('SELECT COUNT(*) as count FROM users').get();
  if (row.count === 0) {
    console.log('[DB SQLite] Seeding initial users and resources...');
    sqliteDb.exec(`
      INSERT INTO users (name, email, password, role, department) VALUES 
      ('Marey Gashaw', 'mareygashaw21@gmail.com', 'mar2121@', 'super_admin', 'Executive Office'),
      ('Resource Manager', 'manager.sharedres@gmail.com', 'manager123', 'resource_manager', 'Operations'),
      ('Meeting Room Dept Head', 'head.meetingroom@gmail.com', 'head123', 'department_head', 'Meeting Rooms Department'),
      ('Conference Hall Dept Head', 'head.confhall@gmail.com', 'head123', 'department_head', 'Conference Halls Department'),
      ('Training Lab Dept Head', 'head.trainlab@gmail.com', 'head123', 'department_head', 'Training Labs Department'),
      ('Vehicle Dept Head', 'head.vehiclefleet@gmail.com', 'head123', 'department_head', 'Vehicles Department'),
      ('Equipment Dept Head', 'head.equipments@gmail.com', 'head123', 'department_head', 'Equipment Department'),
      ('Staff Member', 'staff.member2026@gmail.com', 'staff123', 'staff', 'IT Department'),
      ('System Auditor', 'auditor.system2026@gmail.com', 'auditor123', 'auditor', 'Internal Audit');

      INSERT INTO resources (resource_uuid, name, type, category, capacity, location, features, operating_hours_start, operating_hours_end, requires_approval, requires_checkin, department_restriction, image_url) VALUES
      ('CH-101', 'Executive Conference Room A', 'conference_hall', 'Conference Halls', 16, 'Building A - Floor 3', '["Projector", "Whiteboard", "Video Conferencing", "WiFi"]', '08:00', '18:00', 1, 1, NULL, 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=800&q=80'),
      ('TL-102', 'Innovation Lab 2', 'training_lab', 'Training Labs', 25, 'Building B - Floor 1', '["High-spec PCs", "Smartboard", "Dual Monitors"]', '08:00', '20:00', 1, 1, 'IT Department', 'https://images.unsplash.com/photo-1517502884422-41eaead166d4?auto=format&fit=crop&w=800&q=80'),
      ('MR-103', 'Huddle Pod B', 'meeting_room', 'Meeting Rooms', 6, 'Building A - Floor 2', '["Projector", "Whiteboard", "WiFi"]', '08:00', '18:00', 1, 1, NULL, 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=800&q=80'),
      ('VH-201', 'Toyota RAV4 SUV (Fleet #1)', 'vehicle', 'SUVs', 5, 'Parking Bay 4B', '["GPS", "Automatic Transmission", "Dashcam", "Air Conditioning"]', '06:00', '22:00', 1, 1, NULL, 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=800&q=80'),
      ('VH-202', 'Honda Civic Sedan (Fleet #2)', 'vehicle', 'Sedan Vehicles', 5, 'Parking Bay 2A', '["GPS", "Automatic Transmission", "Air Conditioning"]', '07:00', '19:00', 1, 1, NULL, 'https://images.unsplash.com/photo-1590362891991-f776e747a588?auto=format&fit=crop&w=800&q=80'),
      ('EQ-301', 'Portable 4K Projector & Screen', 'equipment', 'Presentation Gear', 1, 'IT Storage Rm 104', '["HDMI", "Wireless Screen Share"]', '08:00', '18:00', 1, 0, NULL, 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?auto=format&fit=crop&w=800&q=80');
    `);
  }
  
  // Wipe all old test bookings to guarantee 100% clean initial state
  sqliteDb.exec(`
    DELETE FROM check_ins;
    DELETE FROM feedback;
    DELETE FROM approvals;
    DELETE FROM bookings;
    DELETE FROM resource_availability_exceptions;

    UPDATE resources SET requires_approval = 1;
    UPDATE resources SET type = 'conference_hall' WHERE type = 'room' AND (name LIKE '%Conference%' OR category LIKE '%Conference%');
    UPDATE resources SET type = 'meeting_room' WHERE type = 'room';
    UPDATE resources SET type = 'training_lab' WHERE type = 'lab';

    -- Remove any deprecated non-gmail users
    DELETE FROM users WHERE email LIKE '%@organization.org';

    INSERT OR IGNORE INTO users (name, email, password, role, department) VALUES 
      ('Marey Gashaw', 'mareygashaw21@gmail.com', 'mar2121@', 'super_admin', 'Executive Office'),
      ('Resource Manager', 'manager.sharedres@gmail.com', 'manager123', 'resource_manager', 'Operations'),
      ('Meeting Room Dept Head', 'head.meetingroom@gmail.com', 'head123', 'department_head', 'Meeting Rooms Department'),
      ('Conference Hall Dept Head', 'head.confhall@gmail.com', 'head123', 'department_head', 'Conference Halls Department'),
      ('Training Lab Dept Head', 'head.trainlab@gmail.com', 'head123', 'department_head', 'Training Labs Department'),
      ('Vehicle Dept Head', 'head.vehiclefleet@gmail.com', 'head123', 'department_head', 'Vehicles Department'),
      ('Equipment Dept Head', 'head.equipments@gmail.com', 'head123', 'department_head', 'Equipment Department'),
      ('Staff Member', 'staff.member2026@gmail.com', 'staff123', 'staff', 'IT Department'),
      ('System Auditor', 'auditor.system2026@gmail.com', 'auditor123', 'auditor', 'Internal Audit');

    UPDATE users SET name = 'Marey Gashaw', password = 'mar2121@', role = 'super_admin' WHERE email = 'mareygashaw21@gmail.com';
    UPDATE users SET password = 'manager123' WHERE email = 'manager.sharedres@gmail.com';
    UPDATE users SET password = 'head123' WHERE email LIKE 'head.%@gmail.com';
    UPDATE users SET password = 'staff123' WHERE email = 'staff.member2026@gmail.com';
    UPDATE users SET password = 'auditor123' WHERE email = 'auditor.system2026@gmail.com';
    UPDATE users SET password = '123456' WHERE password IS NULL OR password = '';
  `);
  seedSampleBookings();
}

async function ensureDefaultUsersAndRoles() {
  try {
    await query("DELETE FROM users WHERE email LIKE '%@organization.org'");
  } catch (e) {}

  for (const acc of defaultAccounts) {
    try {
      const cleanEmail = acc.email.trim().toLowerCase();
      const existing = await query('SELECT id, password, role FROM users WHERE LOWER(email) = ?', [cleanEmail]);
      if (!existing || existing.length === 0) {
        await query(
          'INSERT INTO users (name, email, password, role, department) VALUES (?, ?, ?, ?, ?)',
          [acc.name, cleanEmail, acc.password, acc.role, acc.department]
        );
        console.log(`[DB] Created default account: ${cleanEmail} (${acc.role})`);
      } else {
        await query(
          'UPDATE users SET name = ?, password = ?, role = ?, department = ? WHERE LOWER(email) = ?',
          [acc.name, acc.password, acc.role, acc.department, cleanEmail]
        );
      }
    } catch (err) {
      console.error(`[DB Error] Ensuring default user ${acc.email}:`, err.message);
    }
  }
}

async function seedSampleBookings() {
  // Do not seed sample bookings — keep bookings empty per user request
}

module.exports = {
  initDatabase,
  query,
  getIsMySQL: () => isMySQL,
  defaultAccounts
};
