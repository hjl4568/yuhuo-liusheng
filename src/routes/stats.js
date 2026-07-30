const express = require('express');
const { db } = require('../db');

const router = express.Router();

// 记录一次访问（按天计数，同一 IP 同日只计一次，避免自刷）
router.post('/visit', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString();
  const key = ip + '|' + today;
  const seen = db.prepare('SELECT 1 FROM visit_dedup WHERE k = ?').get(key);
  if (!seen) {
    db.prepare('INSERT OR IGNORE INTO visit_dedup (k) VALUES (?)').run(key);
    db.prepare('INSERT INTO visits (date, count) VALUES (?, 1) ON CONFLICT(date) DO UPDATE SET count = count + 1').run(today);
  }
  res.json({ ok: true });
});

// 公开统计（供介绍页"实时数据"板块可视化，全部匿名聚合）
router.get('/stats/public', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const totalVisits = db.prepare('SELECT COALESCE(SUM(count),0) AS c FROM visits').get().c;
  const todayVisits = db.prepare('SELECT COALESCE(count,0) AS c FROM visits WHERE date = ?').get(today).c;
  const leadsTotal = db.prepare('SELECT COUNT(*) AS c FROM leads').get().c;
  const d = db.prepare('SELECT COUNT(*) AS c, COALESCE(SUM(amount),0) AS s FROM donors').get();
  const recentDonors = db.prepare('SELECT amount, message, created_at FROM donors ORDER BY id DESC LIMIT 12').all();
  const rows = db.prepare('SELECT content_types FROM leads').all();
  const byType = {};
  rows.forEach(r => {
    (r.content_types || '').split(/[、,]/).forEach(t => {
      t = (t || '').trim();
      if (t) byType[t] = (byType[t] || 0) + 1;
    });
  });
  const daily = db.prepare("SELECT date, count FROM visits WHERE date >= date('now','-6 days') ORDER BY date ASC").all();
  res.json({
    totalVisits, todayVisits,
    leadsTotal,
    donorsTotal: d.c, donorAmount: d.s,
    recentDonors, byType, daily,
  });
});

// 记录一笔赞赏意向（匿名，仅存金额与留言，用于实时捐赠记录可视化）
router.post('/donors', (req, res) => {
  const amount = parseFloat(req.body && req.body.amount) || 0;
  const message = (req.body && req.body.message ? req.body.message : '').toString().trim().slice(0, 200);
  if (amount <= 0) return res.status(400).json({ error: '金额需大于 0' });
  db.prepare('INSERT INTO donors (amount, message) VALUES (?, ?)').run(amount, message);
  res.json({ ok: true });
});

module.exports = router;
