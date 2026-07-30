const express = require('express');
const { db } = require('../db');

const router = express.Router();

// 公开：早期体验意向登记（"用户填信息"板块）
router.post('/', (req, res) => {
  const { name, phone, email, content_types, want_early, message, source } = req.body || {};

  const nameStr = (name || '').toString().trim();
  const phoneStr = (phone || '').toString().trim();
  const emailStr = (email || '').toString().trim();
  const types = Array.isArray(content_types)
    ? content_types.join(',')
    : (content_types || '').toString().trim();
  const want = want_early ? 1 : 0;
  const msg = (message || '').toString().trim().slice(0, 1000);
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString();

  if (!nameStr && !phoneStr && !emailStr) {
    return res.status(400).json({ error: '请至少留下一种联系方式，方便我们后续联系你' });
  }
  if (emailStr && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailStr)) {
    return res.status(400).json({ error: '邮箱格式好像不太对，请检查一下' });
  }

  const info = db.prepare(`
    INSERT INTO leads (name, phone, email, content_types, want_early, message, source, ip_address)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(nameStr, phoneStr, emailStr, types, want, msg, (source || 'intro').toString().trim(), ip);

  res.json({ message: '登记成功，感谢你愿意把心事交托给我们 🔥', id: info.lastInsertRowid });
});

module.exports = router;
