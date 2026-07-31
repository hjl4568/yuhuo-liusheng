const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { db } = require('../db');
const { auth } = require('../middleware/auth');
const { encryptFile, decryptBuffer } = require('../services/crypto');
const { deliverCapsule } = require('../services/scheduler');

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'data', 'uploads');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tempDir = path.join(UPLOAD_DIR, 'temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `temp_${Date.now()}_${Math.round(Math.random() * 1e9)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /\.(txt|md|mp3|wav|m4a|aac|ogg|jpg|jpeg|png|gif|mp4|mov|avi|webm)$/;
    if (allowed.test(path.extname(file.originalname).toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error('不支持的文件类型'));
    }
  },
});

router.post('/', auth, upload.single('file'), (req, res) => {
  const userId = req.userId;
  const {
    title,
    content_type,
    text_content,
    recipient_name,
    recipient_email,
    recipient_relation,
    trigger_type,
    trigger_date,
    public_authorized,
    agreement_signed,
  } = req.body;

  if (!title || !recipient_name || !recipient_email) {
    return res.status(400).json({ error: '标题、收件人姓名和邮箱不能为空' });
  }

  const capsuleCode = `${userId}_${Date.now()}`;
  const viewToken = crypto.randomBytes(16).toString('hex');
  let filePath = '';
  let fileName = '';
  let fileSize = 0;

  if (req.file) {
    const encDir = path.join(UPLOAD_DIR, 'encrypted');
    if (!fs.existsSync(encDir)) fs.mkdirSync(encDir, { recursive: true });
    const encPath = path.join(encDir, `${capsuleCode}.enc`);
    fileSize = encryptFile(req.file.path, encPath);
    filePath = encPath;
    fileName = req.file.originalname;
    fs.unlinkSync(req.file.path);
  }

  let status = 'saved';
  if (trigger_type === 'immediate') {
    status = 'pending';
  } else if (trigger_type === 'scheduled' && trigger_date) {
    status = 'pending';
  }

  const result = db.prepare(`
    INSERT INTO capsules (
      user_id, title, content_type, text_content, file_path, file_name, file_size,
      capsule_code, recipient_name, recipient_email, recipient_relation,
      trigger_type, trigger_date, status, public_authorized, agreement_signed, agreement_log,
      view_token
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    userId, title, content_type || 'text', text_content || '', filePath, fileName, fileSize,
    capsuleCode, recipient_name, recipient_email, recipient_relation || '',
    trigger_type || 'scheduled', trigger_date || null, status,
    parseInt(public_authorized) || 0, parseInt(agreement_signed) || 0,
    agreement_signed ? `用户#${userId}于${new Date().toISOString()}签署协议` : '',
    viewToken
  );

  const capsuleId = result.lastInsertRowid;

  if (trigger_type === 'immediate') {
    const capsule = db.prepare('SELECT * FROM capsules WHERE id = ?').get(capsuleId);
    deliverCapsule(capsule, 'user').then(result => {
      if (result.previewUrl) {
        console.log(`[Immediate] Preview: ${result.previewUrl}`);
      }
    });
  }

  res.json({
    message: '胶囊创建成功',
    capsule: {
      id: capsuleId,
      capsule_code: capsuleCode,
      view_token: viewToken,
      status,
    },
  });
});

router.get('/', auth, (req, res) => {
  const capsules = db.prepare(`
    SELECT id, title, content_type, recipient_name, recipient_email, recipient_relation,
           trigger_type, trigger_date, status, public_authorized, capsule_code, created_at
    FROM capsules WHERE user_id = ? ORDER BY created_at DESC
  `).all(req.userId);
  res.json({ capsules });
});

router.get('/:id', auth, (req, res) => {
  const capsule = db.prepare('SELECT * FROM capsules WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!capsule) {
    return res.status(404).json({ error: '胶囊不存在' });
  }
  const { file_path, ...safeData } = capsule;
  res.json({ capsule: safeData });
});

// ============ 收件人公开查看（无需登录） ============
// 通过安全令牌 view_token 读取胶囊内容，用于“主动送达”闭环：
// 收件人点开邮件/分享链接 -> /view.html?c=TOKEN -> 本接口返回内容 -> 页内展示
router.get('/view/:token', (req, res) => {
  const capsule = db.prepare('SELECT * FROM capsules WHERE view_token = ?').get(req.params.token);
  if (!capsule) {
    return res.status(404).json({ error: 'not_found', message: '内容不存在或链接已失效' });
  }

  // 仅“已送达 / 待送达”状态可公开查看；saved 尚未触发、cancelled 已取消
  const viewable = capsule.status === 'delivered' || capsule.status === 'pending';
  if (!viewable) {
    return res.json({
      status: capsule.status,
      viewable: false,
      recipient_name: capsule.recipient_name,
      title: capsule.title,
    });
  }

  const user = db.prepare('SELECT name, phone FROM users WHERE id = ?').get(capsule.user_id);
  const senderName = (user && user.name) ? user.name : (user && user.phone ? user.phone : '一位朋友');

  const mediaUrl = capsule.file_path
    ? `/api/capsules/${capsule.id}/media?t=${capsule.view_token}`
    : '';

  res.json({
    status: capsule.status,
    viewable: true,
    title: capsule.title,
    sender_name: senderName,
    recipient_name: capsule.recipient_name,
    relation: capsule.recipient_relation,
    content_type: capsule.content_type,
    text_content: capsule.text_content,
    file_name: capsule.file_name,
    mediaUrl,
    created_at: capsule.created_at,
  });
});

// ============ 媒体文件流式读取（支持页内播放） ============
// ?t=view_token 校验；inline=1 时以正确 MIME 内联返回（音频/视频/图片页内播放），否则作为附件下载
router.get('/:id/media', (req, res) => {
  const capsule = db.prepare('SELECT * FROM capsules WHERE id = ?').get(req.params.id);
  if (!capsule) {
    return res.status(404).json({ error: '胶囊不存在' });
  }
  if (req.query.t !== capsule.view_token && req.query.t !== capsule.capsule_code) {
    return res.status(403).json({ error: '无权访问' });
  }
  if (!capsule.file_path || !fs.existsSync(capsule.file_path)) {
    return res.status(404).json({ error: '文件不存在' });
  }

  const ext = (path.extname(capsule.file_name) || '').toLowerCase().replace('.', '');
  const MIME = {
    mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg',
    mp4: 'video/mp4', mov: 'video/quicktime', avi: 'video/x-msvideo', webm: 'video/webm',
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
    txt: 'text/plain', md: 'text/plain',
  };
  const mime = MIME[ext] || 'application/octet-stream';
  const inline = req.query.inline === '1';

  const decrypted = decryptBuffer(fs.readFileSync(capsule.file_path));
  res.setHeader('Content-Type', mime);
  res.setHeader('Content-Length', decrypted.length);
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(capsule.file_name)}"`);
  res.send(decrypted);
});

router.put('/:id', auth, (req, res) => {
  const capsule = db.prepare('SELECT * FROM capsules WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!capsule) {
    return res.status(404).json({ error: '胶囊不存在' });
  }
  if (capsule.status === 'delivered') {
    return res.status(400).json({ error: '已送达的胶囊不可修改' });
  }

  const {
    title, text_content, recipient_name, recipient_email, recipient_relation,
    trigger_type, trigger_date, public_authorized,
  } = req.body;

  let status = capsule.status;
  if (trigger_type === 'immediate') {
    status = 'pending';
  } else if (trigger_type === 'scheduled' && trigger_date) {
    status = 'pending';
  }

  db.prepare(`
    UPDATE capsules SET
      title = COALESCE(?, title),
      text_content = COALESCE(?, text_content),
      recipient_name = COALESCE(?, recipient_name),
      recipient_email = COALESCE(?, recipient_email),
      recipient_relation = COALESCE(?, recipient_relation),
      trigger_type = COALESCE(?, trigger_type),
      trigger_date = COALESCE(?, trigger_date),
      status = ?,
      public_authorized = COALESCE(?, public_authorized),
      updated_at = datetime('now')
    WHERE id = ?
  `).run(
    title, text_content, recipient_name, recipient_email, recipient_relation,
    trigger_type, trigger_date, status,
    public_authorized !== undefined ? parseInt(public_authorized) : null,
    req.params.id
  );

  res.json({ message: '修改成功' });
});

router.delete('/:id', auth, (req, res) => {
  const capsule = db.prepare('SELECT * FROM capsules WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!capsule) {
    return res.status(404).json({ error: '胶囊不存在' });
  }
  if (capsule.status === 'delivered') {
    return res.status(400).json({ error: '已送达的胶囊不可删除，可联系客服处理' });
  }

  if (capsule.file_path && fs.existsSync(capsule.file_path)) {
    fs.unlinkSync(capsule.file_path);
  }

  db.prepare('DELETE FROM capsules WHERE id = ?').run(req.params.id);
  db.prepare('DELETE FROM delivery_logs WHERE capsule_id = ?').run(req.params.id);

  res.json({ message: '胶囊已删除' });
});

router.post('/:id/trigger', auth, async (req, res) => {
  const capsule = db.prepare('SELECT * FROM capsules WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!capsule) {
    return res.status(404).json({ error: '胶囊不存在' });
  }
  if (capsule.status === 'delivered') {
    return res.status(400).json({ error: '该胶囊已送达' });
  }
  if (capsule.status === 'cancelled') {
    return res.status(400).json({ error: '该胶囊已取消' });
  }

  const result = await deliverCapsule(capsule, 'user');
  if (result.success) {
    res.json({ message: '触发成功，邮件已发送', previewUrl: result.previewUrl, viewUrl: result.viewUrl });
  } else {
    res.status(500).json({ error: '触发失败', detail: result.error });
  }
});

router.get('/:id/download', (req, res) => {
  const capsule = db.prepare('SELECT * FROM capsules WHERE id = ?').get(req.params.id);
  if (!capsule) {
    return res.status(404).json({ error: '胶囊不存在' });
  }
  if (req.query.t !== capsule.capsule_code) {
    return res.status(403).json({ error: '无权访问' });
  }
  if (!capsule.file_path || !fs.existsSync(capsule.file_path)) {
    return res.status(404).json({ error: '文件不存在' });
  }

  const decrypted = decryptBuffer(fs.readFileSync(capsule.file_path));
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(capsule.file_name)}"`);
  res.send(decrypted);
});

module.exports = router;
