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

    CREATE TABLE IF NOT EXISTS article_likes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL,
      ip TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(slug, ip)
    );

    CREATE TABLE IF NOT EXISTS article_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL,
      nickname TEXT DEFAULT '匿名旅人',
      content TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'published',
      ip TEXT DEFAULT '',
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

  // 站点设置：键值表。前台捐赠（赞赏）通道默认关闭，由后台开关控制。
  const seedSettings = [
    ['donation_enabled', '0'], // '1' 表示向前台开放赞赏通道；'0' 表示隐藏
  ];
  seedSettings.forEach(([k, v]) => {
    const ex = db.prepare('SELECT 1 FROM site_settings WHERE key = ?').get(k);
    if (!ex) db.prepare('INSERT INTO site_settings (key, value) VALUES (?, ?)').run(k, v);
  });

  const adminUsername = process.env.ADMIN_USERNAME || 'admin';
  // 主账号密码策略（兼顾「部署即用」与「不锁死」与「安全」）：
  //  - 仅首次创建时使用默认弱密码 admin123456（便于部署后立刻登录，部署后请立即在后台改密）。
  //  - 已存在主账号时，默认不再动其密码（密码由管理员在后台“修改密码”自行管理）。
  //  - 防锁死：若库中主账号密码不是有效 bcrypt 哈希（早期占位符导致锁死），自动恢复默认密码，避免永久无法登录。
  //  - 紧急重置：在 .env.prod 设置 ADMIN_RESET_PASSWORD（≥6位）并重启一次，即可强制把主账号密码改为该值（重置后请移除该变量并从后台改密）。
  const DEFAULT_ADMIN_PASSWORD = 'admin123456';
  const isBcryptHash = (s) => typeof s === 'string' && /^\$2[aby]\$/.test(s);
  const existing = db.prepare('SELECT id, password, role FROM admin_users WHERE username = ?').get(adminUsername);

  const ensureMainRole = (id) => db.prepare("UPDATE admin_users SET role = 'main' WHERE id = ? AND role <> 'main'").run(id);

  if (!existing) {
    const hashed = bcrypt.hashSync(DEFAULT_ADMIN_PASSWORD, 10);
    const info = db.prepare('INSERT INTO admin_users (username, password, role, display_name) VALUES (?, ?, ?, ?)').run(adminUsername, hashed, 'main', '主管理员');
    ensureMainRole(info.lastInsertRowid);
    console.log(`[DB] 主管理员已创建: ${adminUsername} (main) — 初始密码 ${DEFAULT_ADMIN_PASSWORD}（请尽快在后台"修改密码"）`);
  } else {
    ensureMainRole(existing.id);
    let needReset = false;
    let resetReason = '';
    // 情况1：历史遗留的损坏/占位符密码（非有效 bcrypt 哈希）→ 自动恢复默认密码，避免永久锁死
    if (!isBcryptHash(existing.password)) {
      needReset = true;
      resetReason = '检测到主账号密码哈希无效（可能由早期占位符导致锁死），已自动重置为默认密码';
    }
    // 情况2：运维紧急重置开关
    const resetPwd = process.env.ADMIN_RESET_PASSWORD;
    if (resetPwd && String(resetPwd).length >= 6) {
      needReset = true;
      resetReason = '检测到 ADMIN_RESET_PASSWORD 环境变量，已强制重置主账号密码（请重置后尽快移除该变量并从后台改密）';
    }
    if (needReset) {
      const newPwd = (resetPwd && String(resetPwd).length >= 6) ? String(resetPwd) : DEFAULT_ADMIN_PASSWORD;
      db.prepare('UPDATE admin_users SET password = ? WHERE id = ?').run(bcrypt.hashSync(newPwd, 10), existing.id);
      console.warn(`[DB][安全] ${resetReason}`);
    } else {
      console.log(`[DB] 主管理员已就绪: ${adminUsername}（密码未被改动）`);
    }
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
