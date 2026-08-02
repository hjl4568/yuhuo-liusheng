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

    CREATE TABLE IF NOT EXISTS site_settings (
      key TEXT PRIMARY KEY,
      value TEXT DEFAULT ''
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

  // 站点设置：键值表。前台捐赠（赞赏）通道默认关闭，由后台开关控制。
  const seedSettings = [
    ['donation_enabled', '0'], // '1' 表示向前台开放赞赏通道；'0' 表示隐藏
  ];
  seedSettings.forEach(([k, v]) => {
    const ex = db.prepare('SELECT 1 FROM site_settings WHERE key = ?').get(k);
    if (!ex) db.prepare('INSERT INTO site_settings (key, value) VALUES (?, ?)').run(k, v);
  });

  const adminUsername = process.env.ADMIN_USERNAME || 'admin';
  // 主账号（引导账号）密码固定为 admin123456，且每次启动都强制写回数据库。
  // 原因：部署示例的 .env.prod 里 ADMIN_PASSWORD 是占位符“改成强密码”，旧逻辑只在首次建库写一次密码，
  // 导致占位符/已遗忘的强密码被写进库后永久锁死、admin123456 永远登不进。
  // 现在无条件对齐 admin123456，保证部署后一定能用 admin/admin123456 登录，不依赖任何环境变量。
  // 日后如需要强密码，可在后台加“修改密码”功能，而不是依赖 .env.prod。
  const adminPassword = 'admin123456';
  const hashed = bcrypt.hashSync(adminPassword, 10);
  const existing = db.prepare('SELECT id FROM admin_users WHERE username = ?').get(adminUsername);
  if (!existing) {
    db.prepare('INSERT INTO admin_users (username, password, role, display_name) VALUES (?, ?, ?, ?)').run(adminUsername, hashed, 'main', '主管理员');
    console.log(`[DB] Admin user created: ${adminUsername} (main) — 初始密码 admin123456（请尽快在后台“修改密码”）`);
  } else {
    // 不再强制覆盖密码：避免把管理员已修改的密码每次启动改回 admin123456（弱口令写死风险）。
    // 仅确保主账号角色正确；密码由管理员自行在后台“修改密码”管理。
    db.prepare("UPDATE admin_users SET role = 'main' WHERE username = ? AND role <> 'main'").run(adminUsername);
    console.log(`[DB] Admin user synced: ${adminUsername} (main) — 密码不再被强制覆盖`);
  }

  console.log('[DB] Database initialized');
}

// 站点设置读写辅助
function getSetting(key, defaultValue = '') {
  const row = db.prepare('SELECT value FROM site_settings WHERE key = ?').get(key);
  return row ? row.value : defaultValue;
}
function setSetting(key, value) {
  db.prepare(
    'INSERT INTO site_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, String(value));
}

module.exports = { db, init, getSetting, setSetting };
