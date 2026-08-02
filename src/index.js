require('dotenv').config();
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const path = require('path');
const { init: initDb, getSetting, setSetting } = require('./db');
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

// 静态资源：HTML 不缓存（确保每次更新立即生效，避免"还是旧版"）；其余资源短缓存
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir, {
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=300');
    }
  },
}));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/capsules', require('./routes/capsules'));
app.use('/api/contracts', require('./routes/contract'));
app.use('/api/leads', require('./routes/leads'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/features', require('./routes/features'));
app.use('/api', require('./routes/stats'));

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
  // 解析 JWT 密钥：优先用环境变量；否则从数据库读取/生成并持久化。
  // 这样每个部署有唯一密钥（不写进源码/仓库），即便仓库公开也无法伪造管理员 token。
  if (!process.env.JWT_SECRET || !String(process.env.JWT_SECRET).trim()) {
    let secret = getSetting('jwt_secret', '');
    if (!secret) {
      secret = crypto.randomBytes(32).toString('hex');
      setSetting('jwt_secret', secret);
      console.log('[DB] 已生成并持久化新的 JWT 密钥');
    } else {
      console.log('[DB] 已载入持久化的 JWT 密钥');
    }
    process.env.JWT_SECRET = secret;
  } else {
    console.log('[INFO] 使用环境变量中的 JWT_SECRET');
  }
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
