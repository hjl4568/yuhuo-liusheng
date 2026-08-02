const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db } = require('../db');
const { auth } = require('../middleware/auth');
const { rateLimit } = require('../middleware/ratelimit');

const router = express.Router();

// 公开写接口限流，防垃圾注册/刷接口
const registerLimiter = rateLimit({ windowMs: 60 * 1000, max: 10, message: '注册过于频繁，请稍后再试' });
const loginLimiter = rateLimit({ windowMs: 60 * 1000, max: 10, message: '登录过于频繁，请稍后再试' });

router.post('/register', registerLimiter, (req, res) => {
  const { phone, password, name, email } = req.body;

  if (!phone || !password) {
    return res.status(400).json({ error: '手机号和密码不能为空' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: '密码至少6位' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE phone = ?').get(phone);
  if (existing) {
    return res.status(409).json({ error: '该手机号已注册' });
  }

  const hashed = bcrypt.hashSync(password, 10);
  const result = db.prepare(`
    INSERT INTO users (phone, password, name, email) VALUES (?, ?, ?, ?)
  `).run(phone, hashed, name || '', email || '');

  const token = jwt.sign({ userId: result.lastInsertRowid }, process.env.JWT_SECRET, { expiresIn: '30d' });

  res.json({
    message: '注册成功',
    token,
    user: { id: result.lastInsertRowid, phone, name: name || '', email: email || '' },
  });
});

router.post('/login', loginLimiter, (req, res) => {
  const { phone, password } = req.body;

  if (!phone || !password) {
    return res.status(400).json({ error: '手机号和密码不能为空' });
  }

  const user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
  if (!user) {
    return res.status(401).json({ error: '手机号或密码错误' });
  }

  if (!bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: '手机号或密码错误' });
  }

  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '30d' });

  res.json({
    message: '登录成功',
    token,
    user: { id: user.id, phone: user.phone, name: user.name, email: user.email },
  });
});

router.get('/profile', auth, (req, res) => {
  const user = db.prepare('SELECT id, phone, name, email, emergency_contact, emergency_phone, created_at FROM users WHERE id = ?').get(req.userId);
  if (!user) {
    return res.status(404).json({ error: '用户不存在' });
  }
  res.json({ user });
});

router.put('/profile', auth, (req, res) => {
  const { name, email, emergency_contact, emergency_phone } = req.body;
  db.prepare(`
    UPDATE users SET name = ?, email = ?, emergency_contact = ?, emergency_phone = ?, updated_at = datetime('now') WHERE id = ?
  `).run(name || '', email || '', emergency_contact || '', emergency_phone || '', req.userId);
  res.json({ message: '更新成功' });
});

module.exports = router;
