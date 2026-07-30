require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { init: initDb } = require('./db');
const { init: initMail } = require('./services/email');
const { start: startScheduler } = require('./services/scheduler');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '120mb' }));
app.use(express.urlencoded({ extended: true, limit: '120mb' }));

// 根路径固定展示项目介绍页（介绍页即首页），应用入口仍可通过 /index.html 访问
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'intro.html'));
});

app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/capsules', require('./routes/capsules'));
app.use('/api/contracts', require('./routes/contract'));
app.use('/api/leads', require('./routes/leads'));
app.use('/api/admin', require('./routes/admin'));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, '..', 'public', 'intro.html'));
  } else {
    res.status(404).json({ error: 'API not found' });
  }
});

async function start() {
  initDb();
  await initMail();
  startScheduler();

  app.listen(PORT, () => {
    console.log(`\n========================================`);
    console.log(`  余火·留声 — 服务器已启动`);
    console.log(`  地址: http://localhost:${PORT}`);
    console.log(`  环境: ${process.env.NODE_ENV || 'development'}`);
    console.log(`========================================\n`);
  });
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
