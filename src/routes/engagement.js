const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { rateLimit } = require('../middleware/ratelimit');

// 取真实客户端 IP（兼容 Nginx 反代：优先 X-Forwarded-For 第一段）
function clientIp(req) {
  const xff = req.headers && req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return (req.ip || 'unknown');
}

// 评论限流：每分钟最多 5 条，防垃圾刷屏
const commentLimiter = rateLimit({ windowMs: 60 * 1000, max: 5, message: '评论过于频繁，请稍后再试' });

// 极简敏感词过滤（仅作基础拦截：广告、违禁、明显不当）
const BAD_WORDS = ['微信', '加我', '代购', '赌博', '博彩', '色情', '贷款', '兼职刷单', 'fuck', 'shit', '色情', '涉政'];

function stripTags(s) {
  return String(s || '').replace(/<[^>]+>/g, '').trim();
}

// 获取某篇文章的点赞总数
router.get('/:slug', (req, res) => {
  const slug = req.params.slug;
  const row = db.prepare('SELECT COUNT(*) AS c FROM article_likes WHERE slug = ?').get(slug);
  res.json({ likes: row ? row.c : 0 });
});

// 点赞（IP 去重：同一 IP 对同一文章只计一次）
router.post('/:slug/like', (req, res) => {
  const slug = req.params.slug;
  const ip = clientIp(req);
  try {
    db.prepare('INSERT OR IGNORE INTO article_likes (slug, ip) VALUES (?, ?)').run(slug, ip);
  } catch (e) {
    // 并发忽略唯一约束冲突
  }
  const row = db.prepare('SELECT COUNT(*) AS c FROM article_likes WHERE slug = ?').get(slug);
  const liked = !!db.prepare('SELECT 1 FROM article_likes WHERE slug = ? AND ip = ?').get(slug, ip);
  res.json({ likes: row ? row.c : 0, liked });
});

// 获取评论列表（已发布的、按时间倒序）
router.get('/:slug/comments', (req, res) => {
  const slug = req.params.slug;
  const rows = db.prepare(
    "SELECT id, nickname, content, created_at FROM article_comments WHERE slug = ? AND status = 'published' ORDER BY id DESC LIMIT 200"
  ).all(slug);
  res.json({ comments: rows });
});

// 提交评论
router.post('/:slug/comment', commentLimiter, (req, res) => {
  const slug = req.params.slug;
  const body = req.body || {};
  let nickname = stripTags(body.nickname).slice(0, 30);
  let content = stripTags(body.content).slice(0, 600);
  if (!content) return res.status(400).json({ error: '评论内容不能为空' });
  if (content.length < 2) return res.status(400).json({ error: '评论太短啦，多写几个字吧' });
  if (!nickname) nickname = '匿名旅人';
  for (const w of BAD_WORDS) {
    if (content.includes(w) || nickname.includes(w)) {
      return res.status(400).json({ error: '评论包含不合适的内容，请修改后重试' });
    }
  }
  const ip = clientIp(req);
  const info = db.prepare(
    'INSERT INTO article_comments (slug, nickname, content, ip) VALUES (?, ?, ?, ?)'
  ).run(slug, nickname, content, ip);
  const row = db.prepare(
    'SELECT id, nickname, content, created_at FROM article_comments WHERE id = ?'
  ).get(info.lastInsertRowid);
  res.json({ comment: row });
});

module.exports = router;
