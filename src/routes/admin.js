const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db, getSetting, setSetting } = require('../db');
const { adminAuth, mainAdminAuth } = require('../middleware/auth');
const { deliverCapsule } = require('../services/scheduler');
const { getMailStatus, sendTestMail } = require('../services/email');

const router = express.Router();

// 操作日志辅助函数
function logAction(req, action, target = '', detail = '') {
  try {
    db.prepare('INSERT INTO admin_action_logs (admin_id, admin_name, action, target, detail, ip) VALUES (?, ?, ?, ?, ?, ?)').run(
      req.adminId,
      req.adminDisplayName || req.adminUsername || `#${req.adminId}`,
      action,
      target,
      detail,
      req.ip || ''
    );
  } catch (e) {
    console.error('[admin logAction error]', e.message);
  }
}

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: '用户名和密码不能为空' });
  }

  const admin = db.prepare('SELECT * FROM admin_users WHERE username = ?').get(username);
  if (!admin || !bcrypt.compareSync(password, admin.password)) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }
  if (admin.is_active === 0) {
    return res.status(403).json({ error: '该账号已被停用，请联系主管理员' });
  }

  const token = jwt.sign({
    adminId: admin.id,
    role: 'admin',
    adminRole: admin.role || 'main',
    adminUsername: admin.username,
    adminDisplayName: admin.display_name || admin.username,
  }, process.env.JWT_SECRET, { expiresIn: '7d' });

  // 记录登录
  try {
    db.prepare('INSERT INTO admin_action_logs (admin_id, admin_name, action, target, detail, ip) VALUES (?, ?, ?, ?, ?, ?)').run(
      admin.id,
      admin.display_name || admin.username,
      'login',
      '',
      '登录管理后台',
      req.ip || ''
    );
  } catch (e) { /* ignore */ }

  res.json({
    message: '登录成功',
    token,
    adminInfo: {
      id: admin.id,
      username: admin.username,
      displayName: admin.display_name || admin.username,
      role: admin.role || 'main',
    },
  });
});

router.get('/dashboard', adminAuth, (req, res) => {
  const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  const totalCapsules = db.prepare('SELECT COUNT(*) as count FROM capsules').get().count;
  const pendingCapsules = db.prepare("SELECT COUNT(*) as count FROM capsules WHERE status = 'pending'").get().count;
  const deliveredCapsules = db.prepare("SELECT COUNT(*) as count FROM capsules WHERE status = 'delivered'").get().count;
  const totalLogs = db.prepare('SELECT COUNT(*) as count FROM delivery_logs').get().count;
  const successLogs = db.prepare("SELECT COUNT(*) as count FROM delivery_logs WHERE status = 'success'").get().count;
  const totalLeads = db.prepare('SELECT COUNT(*) as count FROM leads').get().count;

  // 注册统计
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayUsers = db.prepare("SELECT COUNT(*) as count FROM users WHERE created_at >= ?").get(todayStr).count;
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const weekUsers = db.prepare("SELECT COUNT(*) as count FROM users WHERE created_at >= ?").get(weekAgo).count;
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString();
  const monthUsers = db.prepare("SELECT COUNT(*) as count FROM users WHERE created_at >= ?").get(monthAgo).count;

  res.json({
    stats: {
      totalUsers,
      totalCapsules,
      pendingCapsules,
      deliveredCapsules,
      totalLogs,
      successLogs,
      totalLeads,
      todayUsers,
      weekUsers,
      monthUsers,
    },
  });
});

// 重置公开统计数据（主账号专属）：清空 visits / visit_dedup / leads / donors
// 用途：让首页"实时数据 / 生长之树"从零开始累计真实数据（避免开发期测试数据污染展示）。
// 注意：仅清空"公开聚合"类数据，不影响真实用户账户、胶囊、合同、投递记录。
router.post('/reset-public-stats', mainAdminAuth, (req, res) => {
  try {
    const before = {
      visits: db.prepare('SELECT COUNT(*) AS c FROM visits').get().c,
      leads: db.prepare('SELECT COUNT(*) AS c FROM leads').get().c,
      donors: db.prepare('SELECT COUNT(*) AS c FROM donors').get().c,
    };
    db.prepare('DELETE FROM visits').run();
    db.prepare('DELETE FROM visit_dedup').run();
    db.prepare('DELETE FROM leads').run();
    db.prepare('DELETE FROM donors').run();
    logAction(req, 'reset_public_stats', 'stats',
      `清零公开统计：访问${before.visits} / 登记${before.leads} / 赞赏${before.donors}`);
    res.json({ message: '公开统计已重置，将从此刻起重新累计真实数据', before });
  } catch (e) {
    res.status(500).json({ error: '重置失败：' + e.message });
  }
});

router.get('/users', adminAuth, (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = 20;
  const offset = (page - 1) * limit;
  const search = req.query.search || '';

  let query = `SELECT u.id, u.phone, u.name, u.email, u.emergency_contact, u.emergency_phone, u.created_at,
      (SELECT COUNT(*) FROM capsules WHERE user_id = u.id) as capsule_count
    FROM users u`;
  let countQuery = 'SELECT COUNT(*) as count FROM users u';
  const params = [];

  if (search) {
    query += ' WHERE u.phone LIKE ? OR u.name LIKE ? OR u.email LIKE ?';
    countQuery += ' WHERE u.phone LIKE ? OR u.name LIKE ? OR u.email LIKE ?';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  query += ' ORDER BY u.created_at DESC LIMIT ? OFFSET ?';
  const users = db.prepare(query).all(...params, limit, offset);
  const total = db.prepare(countQuery).get(...params).count;

  res.json({ users, total, page, totalPages: Math.ceil(total / limit) });
});

// 导出全量用户 CSV（必须在 /users/:id 之前，否则 "export" 被当作 id）
router.get('/users/export', adminAuth, (req, res) => {
  const users = db.prepare(`
    SELECT u.id, u.phone, u.name, u.email, u.emergency_contact, u.emergency_phone, u.created_at,
      (SELECT COUNT(*) FROM capsules WHERE user_id = u.id) as capsule_count
    FROM users u ORDER BY u.created_at DESC
  `).all();

  const header = ['编号', '手机号', '姓名', '邮箱', '紧急联系人', '紧急联系电话', '胶囊数', '注册时间'];
  const escapeCsv = (v) => {
    const s = v == null ? '' : String(v);
    return '"' + s.replace(/"/g, '""') + '"';
  };
  const rows = users.map(u => [
    u.id, u.phone, u.name, u.email, u.emergency_contact, u.emergency_phone, u.capsule_count,
    u.created_at,
  ].map(escapeCsv).join(','));

  const csv = '﻿' + header.map(escapeCsv).join(',') + '\n' + rows.join('\n');
  logAction(req, 'export_csv', 'users', `导出 ${users.length} 条用户数据(CSV)`);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="users-export.csv"');
  res.send(csv);
});

// 导出全量用户 Excel（HTML表格格式，Excel/WPS直接打开；必须在 /users/:id 之前）
router.get('/users/export-excel', adminAuth, (req, res) => {
  const users = db.prepare(`
    SELECT u.id, u.phone, u.name, u.email, u.emergency_contact, u.emergency_phone, u.created_at,
      (SELECT COUNT(*) FROM capsules WHERE user_id = u.id) as capsule_count
    FROM users u ORDER BY u.created_at DESC
  `).all();

  const rows = users.map(u => `<tr>
    <td>${u.id}</td><td>${u.phone || ''}</td><td>${u.name || ''}</td><td>${u.email || ''}</td>
    <td>${u.emergency_contact || ''}</td><td>${u.emergency_phone || ''}</td><td>${u.capsule_count || 0}</td><td>${u.created_at || ''}</td>
  </tr>`).join('');

  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="UTF-8"><style>td,th{font-size:12px;border:1px solid #ccc;padding:4px 8px;white-space:nowrap;}th{background:#4472C4;color:#fff;}</style></head>
<body><table>
<thead><tr><th>编号</th><th>手机号</th><th>姓名</th><th>邮箱</th><th>紧急联系人</th><th>紧急联系电话</th><th>胶囊数</th><th>注册时间</th></tr></thead>
<tbody>${rows}</tbody>
</table></body></html>`;

  logAction(req, 'export_excel', 'users', `导出 ${users.length} 条用户数据(Excel)`);
  res.setHeader('Content-Type', 'application/vnd.ms-excel; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="users-export.xls"');
  res.send(html);
});

// 用户详情：完整信息 + 其所有胶囊 + 投递日志
router.get('/users/:id', adminAuth, (req, res) => {
  const user = db.prepare('SELECT id, phone, name, email, emergency_contact, emergency_phone, created_at, updated_at FROM users WHERE id = ?').get(req.params.id);
  if (!user) {
    return res.status(404).json({ error: '用户不存在' });
  }

  const capsules = db.prepare(`
    SELECT id, title, capsule_code, content_type, status, trigger_type, trigger_date, created_at
    FROM capsules WHERE user_id = ? ORDER BY created_at DESC
  `).all(req.params.id);

  const logs = db.prepare(`
    SELECT l.id, l.send_method, l.recipient, l.status, l.operator, l.sent_at, l.error_message,
      c.title as capsule_title
    FROM delivery_logs l
    LEFT JOIN capsules c ON l.capsule_id = c.id
    WHERE c.user_id = ? ORDER BY l.sent_at DESC LIMIT 50
  `).all(req.params.id);

  const contracts = db.prepare(`
    SELECT id, contract_no, contract_type, status, signed_at
    FROM contracts WHERE user_id = ? ORDER BY signed_at DESC
  `).all(req.params.id);

  res.json({ user, capsules, logs, contracts });
});

router.get('/capsules', adminAuth, (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = 20;
  const offset = (page - 1) * limit;
  const status = req.query.status || '';

  let query = `
    SELECT c.*, u.phone as user_phone, u.name as user_name
    FROM capsules c JOIN users u ON c.user_id = u.id
  `;
  let countQuery = 'SELECT COUNT(*) as count FROM capsules c';
  const params = [];

  if (status) {
    query += ' WHERE c.status = ?';
    countQuery += ' WHERE c.status = ?';
    params.push(status);
  }

  query += ' ORDER BY c.created_at DESC LIMIT ? OFFSET ?';
  const capsules = db.prepare(query).all(...params, limit, offset);
  const total = db.prepare(countQuery).get(...params).count;

  const safeCapsules = capsules.map(c => {
    const { file_path, ...safe } = c;
    return safe;
  });

  res.json({ capsules: safeCapsules, total, page, totalPages: Math.ceil(total / limit) });
});

router.get('/logs', adminAuth, (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = 20;
  const offset = (page - 1) * limit;

  const logs = db.prepare(`
    SELECT l.*, c.title as capsule_title, c.capsule_code
    FROM delivery_logs l
    LEFT JOIN capsules c ON l.capsule_id = c.id
    ORDER BY l.sent_at DESC LIMIT ? OFFSET ?
  `).all(limit, offset);

  const total = db.prepare('SELECT COUNT(*) as count FROM delivery_logs').get().count;

  res.json({ logs, total, page, totalPages: Math.ceil(total / limit) });
});

router.post('/capsules/:id/trigger', adminAuth, async (req, res) => {
  const capsule = db.prepare('SELECT * FROM capsules WHERE id = ?').get(req.params.id);
  if (!capsule) {
    return res.status(404).json({ error: '胶囊不存在' });
  }
  if (capsule.status === 'delivered') {
    return res.status(400).json({ error: '该胶囊已送达' });
  }

  const result = await deliverCapsule(capsule, `admin#${req.adminId}`);
  // 记录「操作内容 + 实际后果」，便于所有管理员在广播日志中跟进
  let detail = `后台触发胶囊《${capsule.title}》`;
  if (result.success) {
    detail += `：触发成功，已发送 ${result.emailDelivered} 封邮件`;
    if (result.reservedCount > 0) detail += `，${result.reservedCount} 项为预留/人工方式待补发`;
  } else {
    detail += `：触发失败（${result.error || result.message || '未知原因'}）`;
  }
  logAction(req, 'trigger_capsule', `capsule:${capsule.id}`, detail);
  if (result.success) {
    res.json({ message: '后台触发成功', previewUrl: result.previewUrl });
  } else {
    res.status(500).json({ error: '触发失败', detail: result.error });
  }
});

router.get('/leads', adminAuth, (req, res) => {
  const leads = db.prepare(`
    SELECT id, name, phone, email, content_types, want_early, message, created_at
    FROM leads ORDER BY created_at DESC LIMIT 200
  `).all();
  const total = db.prepare('SELECT COUNT(*) as count FROM leads').get().count;
  res.json({ leads, total });
});

router.get('/leads/export', adminAuth, (req, res) => {
  const leads = db.prepare(`
    SELECT id, name, phone, email, content_types, want_early, message, source, ip_address, created_at
    FROM leads ORDER BY created_at DESC
  `).all();

  const header = ['编号', '称呼', '手机号', '邮箱', '意向内容', '愿参与早期', '留言', '来源', 'IP', '登记时间'];
  const escapeCsv = (v) => {
    const s = v == null ? '' : String(v);
    return '"' + s.replace(/"/g, '""') + '"';
  };
  const rows = leads.map(l => [
    l.id, l.name, l.phone, l.email, l.content_types, l.want_early ? '是' : '否',
    l.message, l.source, l.ip_address, l.created_at,
  ].map(escapeCsv).join(','));

  // 加 BOM 头，保证 Excel 正确识别 UTF-8 中文
  const csv = '﻿' + header.map(escapeCsv).join(',') + '\n' + rows.join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="leads-export.csv"');
  res.send(csv);
});

router.get('/mail-status', adminAuth, (req, res) => {
  res.json(getMailStatus());
});

router.post('/mail-test', adminAuth, async (req, res) => {
  try {
    const r = await sendTestMail();
    if (r.ok) {
      res.json({ ok: true, message: `测试邮件已发送，请查收 ${process.env.WORK_MAIL || ''}` });
    } else {
      res.json({ ok: false, error: r.error || '未配置邮件服务' });
    }
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ==================== 管理账号系统（仅主账号） ====================

// 获取所有管理员账号
router.get('/admins', mainAdminAuth, (req, res) => {
  const admins = db.prepare(`
    SELECT a.id, a.username, a.display_name, a.role, a.is_active, a.created_at, a.created_by,
      creator.username as created_by_name
    FROM admin_users a
    LEFT JOIN admin_users creator ON a.created_by = creator.id
    ORDER BY a.role DESC, a.created_at ASC
  `).all();

  // 统计每个管理员的操作数
  const result = admins.map(a => {
    const logCount = db.prepare('SELECT COUNT(*) as count FROM admin_action_logs WHERE admin_id = ?').get(a.id).count;
    const lastAction = db.prepare('SELECT created_at FROM admin_action_logs WHERE admin_id = ? ORDER BY created_at DESC LIMIT 1').get(a.id);
    return { ...a, action_count: logCount, last_action_at: lastAction ? lastAction.created_at : null };
  });

  res.json({ admins: result });
});

// 创建子管理员账号
router.post('/admins', mainAdminAuth, (req, res) => {
  const { username, password, display_name } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: '用户名和密码不能为空' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: '密码至少6位' });
  }

  const existing = db.prepare('SELECT id FROM admin_users WHERE username = ?').get(username);
  if (existing) {
    return res.status(400).json({ error: '用户名已存在' });
  }

  const hashed = bcrypt.hashSync(password, 10);
  const result = db.prepare('INSERT INTO admin_users (username, password, role, display_name, created_by) VALUES (?, ?, ?, ?, ?)').run(
    username, hashed, 'sub', display_name || username, req.adminId
  );

  logAction(req, 'create_admin', `sub:${username}`, `创建子管理员 ${display_name || username} (${username})`);

  res.json({ message: '子管理员创建成功', id: result.lastInsertRowid });
});

// 删除子管理员账号（不能删主账号、不能删自己）
router.delete('/admins/:id', mainAdminAuth, (req, res) => {
  const id = parseInt(req.params.id);
  if (id === req.adminId) {
    return res.status(400).json({ error: '不能删除自己' });
  }

  const target = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(id);
  if (!target) {
    return res.status(404).json({ error: '账号不存在' });
  }
  if (target.role === 'main') {
    return res.status(400).json({ error: '不能删除主管理员账号' });
  }

  db.prepare('DELETE FROM admin_users WHERE id = ?').run(id);
  logAction(req, 'delete_admin', `sub:${target.username}`, `删除子管理员 ${target.display_name || target.username}`);

  res.json({ message: '子管理员已删除' });
});

// 启用/停用子管理员
router.put('/admins/:id/toggle', mainAdminAuth, (req, res) => {
  const id = parseInt(req.params.id);
  if (id === req.adminId) {
    return res.status(400).json({ error: '不能停用自己' });
  }

  const target = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(id);
  if (!target) {
    return res.status(404).json({ error: '账号不存在' });
  }
  if (target.role === 'main') {
    return res.status(400).json({ error: '不能停用主管理员账号' });
  }

  const newState = target.is_active ? 0 : 1;
  db.prepare('UPDATE admin_users SET is_active = ? WHERE id = ?').run(newState, id);
  logAction(req, 'toggle_admin', `sub:${target.username}`, newState ? '启用' : '停用');

  res.json({ message: newState ? '已启用' : '已停用', is_active: newState });
});

// 修改自身密码（所有登录的管理员均可，用于替换初始弱口令 admin123456）
router.post('/change-password', adminAuth, (req, res) => {
  const { current_password, new_password } = req.body || {};
  if (!current_password || !new_password) {
    return res.status(400).json({ error: '当前密码和新密码都不能为空' });
  }
  if (String(new_password).length < 6) {
    return res.status(400).json({ error: '新密码至少 6 位' });
  }
  const admin = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(req.adminId);
  if (!admin) return res.status(404).json({ error: '管理员不存在' });
  if (!bcrypt.compareSync(String(current_password), admin.password)) {
    return res.status(401).json({ error: '当前密码错误' });
  }
  db.prepare('UPDATE admin_users SET password = ? WHERE id = ?').run(bcrypt.hashSync(String(new_password), 10), admin.id);
  logAction(req, 'change_password', `admin:${admin.id}`, `管理员「${admin.username}」修改了登录密码`);
  res.json({ message: '密码修改成功，下次登录请使用新密码' });
});

// 管理员操作日志（广播形式：所有管理员均可查看，便于跟进变化）
router.get('/admin-logs', adminAuth, (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = 30;
  const offset = (page - 1) * limit;
  const adminFilter = req.query.admin_id || '';
  const todayOnly = req.query.today === '1';

  const conds = [];
  const params = [];
  if (adminFilter) { conds.push('admin_id = ?'); params.push(adminFilter); }
  if (todayOnly) { conds.push("created_at >= date('now')"); }
  const where = conds.length ? ' WHERE ' + conds.join(' AND ') : '';

  const query = `SELECT * FROM admin_action_logs${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
  const countQuery = `SELECT COUNT(*) as count FROM admin_action_logs${where}`;
  const logs = db.prepare(query).all(...params, limit, offset);
  const total = db.prepare(countQuery).get(...params).count;
  // 今日动态数（用于广播摘要）
  const todayCount = db.prepare("SELECT COUNT(*) as c FROM admin_action_logs WHERE created_at >= date('now')").get().c;

  res.json({ logs, total, page, totalPages: Math.ceil(total / limit), todayCount });
});

// ==================== 捐赠管理（完整控制：汇总 / 列表 / 导出 / 前台开关） ====================

// 捐赠汇总 + 全部记录（后台完整保留，便于财务与导出分析）
router.get('/donations', adminAuth, (req, res) => {
  const d = db.prepare('SELECT COUNT(*) AS c, COALESCE(SUM(amount),0) AS s FROM donors').get();
  const donors = db.prepare('SELECT id, amount, message, created_at FROM donors ORDER BY id DESC').all();
  res.json({ total: d.c, amount: d.s, donors });
});

// 导出捐赠 CSV
router.get('/donations/export', adminAuth, (req, res) => {
  const donors = db.prepare('SELECT id, amount, message, created_at FROM donors ORDER BY id DESC').all();
  const header = ['编号', '金额(元)', '留言', '时间'];
  const escapeCsv = (v) => {
    const s = v == null ? '' : String(v);
    return '"' + s.replace(/"/g, '""') + '"';
  };
  const rows = donors.map(x => [x.id, x.amount, x.message, x.created_at].map(escapeCsv).join(','));
  const csv = '﻿' + header.map(escapeCsv).join(',') + '\n' + rows.join('\n');
  logAction(req, 'export_csv', 'donations', `导出 ${donors.length} 条赞赏记录(CSV)`);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="donations-export.csv"');
  res.send(csv);
});

// 导出捐赠 Excel
router.get('/donations/export-excel', adminAuth, (req, res) => {
  const donors = db.prepare('SELECT id, amount, message, created_at FROM donors ORDER BY id DESC').all();
  const rows = donors.map(x => `<tr>
    <td>${x.id}</td>
    <td>${x.amount != null ? x.amount : 0}</td>
    <td>${(x.message || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td>
    <td>${x.created_at || ''}</td>
  </tr>`).join('');
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="UTF-8"><style>td,th{font-size:12px;border:1px solid #ccc;padding:4px 8px;white-space:nowrap;}th{background:#4472C4;color:#fff;}</style></head>
<body><table>
<thead><tr><th>编号</th><th>金额(元)</th><th>留言</th><th>时间</th></tr></thead>
<tbody>${rows}</tbody>
</table></body></html>`;
  logAction(req, 'export_excel', 'donations', `导出 ${donors.length} 条赞赏记录(Excel)`);
  res.setHeader('Content-Type', 'application/vnd.ms-excel; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="donations-export.xls"');
  res.send(html);
});

// 读取站点设置（前台赞赏通道开关）
router.get('/settings', adminAuth, (req, res) => {
  const enabled = getSetting('donation_enabled', '0') === '1';
  res.json({ donation_enabled: enabled });
});

// 更新站点设置：控制前台是否开放赞赏通道
router.put('/settings', adminAuth, (req, res) => {
  const v = req.body && req.body.donation_enabled;
  const enabled = v === true || v === '1' || v === 1;
  setSetting('donation_enabled', enabled ? '1' : '0');
  logAction(req, 'update_setting', 'site', `前台赞赏通道：${enabled ? '开启' : '关闭'}`);
  res.json({ ok: true, donation_enabled: enabled });
});

// ==================== Excel 导出（已移到 /users/:id 之前） ====================

module.exports = router;
