const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db } = require('../db');
const { adminAuth } = require('../middleware/auth');
const { deliverCapsule } = require('../services/scheduler');

const router = express.Router();

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: '用户名和密码不能为空' });
  }

  const admin = db.prepare('SELECT * FROM admin_users WHERE username = ?').get(username);
  if (!admin || !bcrypt.compareSync(password, admin.password)) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }

  const token = jwt.sign({ adminId: admin.id, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '7d' });
  res.json({ message: '登录成功', token });
});

router.get('/dashboard', adminAuth, (req, res) => {
  const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  const totalCapsules = db.prepare('SELECT COUNT(*) as count FROM capsules').get().count;
  const pendingCapsules = db.prepare("SELECT COUNT(*) as count FROM capsules WHERE status = 'pending'").get().count;
  const deliveredCapsules = db.prepare("SELECT COUNT(*) as count FROM capsules WHERE status = 'delivered'").get().count;
  const totalLogs = db.prepare('SELECT COUNT(*) as count FROM delivery_logs').get().count;
  const successLogs = db.prepare("SELECT COUNT(*) as count FROM delivery_logs WHERE status = 'success'").get().count;
  const totalLeads = db.prepare('SELECT COUNT(*) as count FROM leads').get().count;

  res.json({
    stats: {
      totalUsers,
      totalCapsules,
      pendingCapsules,
      deliveredCapsules,
      totalLogs,
      successLogs,
      totalLeads,
    },
  });
});

router.get('/users', adminAuth, (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = 20;
  const offset = (page - 1) * limit;
  const search = req.query.search || '';

  let query = 'SELECT id, phone, name, email, emergency_contact, emergency_phone, created_at FROM users';
  let countQuery = 'SELECT COUNT(*) as count FROM users';
  const params = [];

  if (search) {
    query += ' WHERE phone LIKE ? OR name LIKE ? OR email LIKE ?';
    countQuery += ' WHERE phone LIKE ? OR name LIKE ? OR email LIKE ?';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  const users = db.prepare(query).all(...params, limit, offset);
  const total = db.prepare(countQuery).get(...params).count;

  res.json({ users, total, page, totalPages: Math.ceil(total / limit) });
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

module.exports = router;
