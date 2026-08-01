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
  // 主账号（引导账号）密码处理：默认 admin123456。
  // 仅当用户在 .env.prod 显式配置了“真实强密码”（且不是示例占位符“改成强密码”、也不是空值）时才用它，
  // 否则回落到 admin123456。这样可避免：① 直接复制示例未改 → 占位符被写进库；
  // ② 配了强密码但已遗忘 → admin123456 永远登不进去而被永久锁死。
  // 每次启动都把主账号密码同步为下面这个值，确保改了配置重启即生效。
  const PW_PLACEHOLDER = '改成强密码';
  const envPw = (process.env.ADMIN_PASSWORD || '').trim();
  const adminPassword = (envPw && envPw !== PW_PLACEHOLDER) ? envPw : 'admin123456';
  const hashed = bcrypt.hashSync(adminPassword, 10);
  const existing = db.prepare('SELECT id FROM admin_users WHERE username = ?').get(adminUsername);
  if (!existing) {
    db.prepare('INSERT INTO admin_users (username, password, role, display_name) VALUES (?, ?, ?, ?)').run(adminUsername, hashed, 'main', '主管理员');
    console.log(`[DB] Admin user created: ${adminUsername} (main)`);
  } else {
    // 关键修复：主账号密码与 .env.prod 的 ADMIN_PASSWORD 保持一致（每次启动都同步）。
    // 否则一旦首次建库时用了别的密码（例如部署示例里的占位符“改成强密码”或用户已忘记的强密码），
    // 之后无论怎么改 .env.prod 都无法登录，且旧逻辑只在首次建库时写一次密码、永不更新。
    // 这里保证：ADMIN_PASSWORD 配成啥，数据库主账号密码就是啥；不配则回落到默认 admin123456。
    db.prepare("UPDATE admin_users SET role = 'main', password = ?, display_name = '主管理员' WHERE username = ?").run(hashed, adminUsername);
    console.log(`[DB] Admin user synced: ${adminUsername} (main) — 密码已与 ADMIN_PASSWORD 对齐`);
  }

  console.log('[DB] Database initialized');
}

module.exports = { db, init };
