const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, '..', 'data', 'yuhuo.db');

// 确保数据库所在目录存在（云端全新部署时 data/ 不存在，必须先创建，否则启动即崩）
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function init() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT DEFAULT '',
      email TEXT DEFAULT '',
      emergency_contact TEXT DEFAULT '',
      emergency_phone TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS capsules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      content_type TEXT NOT NULL DEFAULT 'text',
      text_content TEXT DEFAULT '',
      file_path TEXT DEFAULT '',
      file_name TEXT DEFAULT '',
      file_size INTEGER DEFAULT 0,
      capsule_code TEXT UNIQUE NOT NULL,
      recipient_name TEXT NOT NULL,
      recipient_email TEXT NOT NULL,
      recipient_relation TEXT DEFAULT '',
      trigger_type TEXT NOT NULL DEFAULT 'scheduled',
      trigger_date TEXT,
      status TEXT NOT NULL DEFAULT 'saved',
      public_authorized INTEGER DEFAULT 0,
      agreement_signed INTEGER DEFAULT 0,
      agreement_log TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS delivery_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      capsule_id INTEGER NOT NULL,
      send_method TEXT NOT NULL DEFAULT 'email',
      recipient TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      error_message TEXT DEFAULT '',
      operator TEXT DEFAULT 'system',
      sent_at TEXT,
      FOREIGN KEY (capsule_id) REFERENCES capsules(id)
    );

    CREATE TABLE IF NOT EXISTS contracts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      contract_type TEXT NOT NULL DEFAULT 'service',
      contract_no TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      signer_name TEXT NOT NULL,
      signer_phone TEXT DEFAULT '',
      signer_idcard_mask TEXT DEFAULT '',
      signature_image TEXT DEFAULT '',
      contract_hash TEXT NOT NULL,
      content_snapshot TEXT NOT NULL,
      ip_address TEXT DEFAULT '',
      user_agent TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'signed',
      signed_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      email TEXT DEFAULT '',
      content_types TEXT DEFAULT '',
      want_early INTEGER DEFAULT 0,
      message TEXT DEFAULT '',
      source TEXT DEFAULT '',
      entity_type TEXT DEFAULT '',
      ip_address TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS visits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT UNIQUE NOT NULL,
      count INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS visit_dedup (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      k TEXT UNIQUE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS donors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      amount REAL DEFAULT 0,
      message TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // 收件人查看页所需的安全公开令牌（随机不可猜测）；兼容已存在的库，缺列则补
  try {
    db.exec('ALTER TABLE capsules ADD COLUMN view_token TEXT DEFAULT \'\'');
  } catch (e) {
    // 列已存在则忽略（SQLite 对重复列报错）
  }
  // 意向登记：代表对象（个人/一群人/团体/机构）
  try {
    db.exec('ALTER TABLE leads ADD COLUMN entity_type TEXT DEFAULT \'\'');
  } catch (e) {
    // 列已存在则忽略
  }
  // 胶囊：多收件人 JSON、用户档案、投递说明
  try {
    db.exec('ALTER TABLE capsules ADD COLUMN recipients_json TEXT DEFAULT \'\'');
  } catch (e) {}
  try {
    db.exec('ALTER TABLE capsules ADD COLUMN sender_profile TEXT DEFAULT \'\'');
  } catch (e) {}
  try {
    db.exec('ALTER TABLE capsules ADD COLUMN delivery_note TEXT DEFAULT \'\'');
  } catch (e) {}
  // 回填历史数据：为没有 view_token 的胶囊生成随机令牌
  db.prepare(`UPDATE capsules SET view_token = lower(hex(randomblob(16))) WHERE view_token IS NULL OR view_token = ''`).run();

  // 管理员账号系统：角色（main主账号 / sub子账号）、显示名、启用状态、创建者
  try { db.exec("ALTER TABLE admin_users ADD COLUMN role TEXT DEFAULT 'sub'"); } catch (e) {}
  try { db.exec("ALTER TABLE admin_users ADD COLUMN display_name TEXT DEFAULT ''"); } catch (e) {}
  try { db.exec("ALTER TABLE admin_users ADD COLUMN is_active INTEGER DEFAULT 1"); } catch (e) {}
  try { db.exec("ALTER TABLE admin_users ADD COLUMN created_by INTEGER"); } catch (e) {}

  // 管理员操作日志表
  db.exec(`
    CREATE TABLE IF NOT EXISTS admin_action_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_id INTEGER NOT NULL,
      admin_name TEXT DEFAULT '',
      action TEXT NOT NULL,
      target TEXT DEFAULT '',
      detail TEXT DEFAULT '',
      ip TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  const adminUsername = process.env.ADMIN_USERNAME || 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123456';
  const existing = db.prepare('SELECT id FROM admin_users WHERE username = ?').get(adminUsername);
  if (!existing) {
    const hashed = bcrypt.hashSync(adminPassword, 10);
    db.prepare('INSERT INTO admin_users (username, password, role, display_name) VALUES (?, ?, ?, ?)').run(adminUsername, hashed, 'main', '主管理员');
    console.log(`[DB] Admin user created: ${adminUsername} (main)`);
  } else {
    // 确保默认管理员是 main 角色
    db.prepare("UPDATE admin_users SET role = 'main' WHERE username = ? AND (role IS NULL OR role = '' OR role = 'sub')").run(adminUsername);
  }

  console.log('[DB] Database initialized');
}

module.exports = { db, init };
