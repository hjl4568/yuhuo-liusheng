const express = require('express');
const jwt = require('jsonwebtoken');
const { db } = require('../db');
const { auth } = require('../middleware/auth');
const {
  CONTRACT_TITLE,
  CONTRACT_BODY,
  buildSnapshot,
  computeHash,
  generateContractNo,
} = require('../services/contractTemplate');

const router = express.Router();

function escapeHtml(str = '') {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getClientIp(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0].trim() ||
    req.ip ||
    req.connection.remoteAddress ||
    ''
  );
}

// ===== 公开：获取合同模板正文 =====
router.get('/template', (req, res) => {
  res.json({ title: CONTRACT_TITLE, body: CONTRACT_BODY });
});

// ===== 公开：合同验真（不暴露内容，仅核验完整性） =====
router.get('/verify/:contractNo', (req, res) => {
  const { contractNo } = req.params;
  const contract = db.prepare('SELECT * FROM contracts WHERE contract_no = ?').get(contractNo);
  if (!contract) {
    return res.send(renderVerifyHtml(null));
  }
  res.send(renderVerifyHtml(contract));
});

// ===== 鉴权：签署合同 =====
router.post('/', auth, (req, res) => {
  const userId = req.userId;
  const { signer_name, signer_phone, signer_idcard_mask, signature } = req.body;

  if (!signer_name || !signer_name.trim()) {
    return res.status(400).json({ error: '请填写签署人姓名' });
  }
  if (!signature || !signature.startsWith('data:image')) {
    return res.status(400).json({ error: '请先完成手写签名' });
  }

  // 同一用户仅保留一份生效的服务协议，避免重复签署
  const existing = db.prepare(
    "SELECT id, contract_no, signed_at, status FROM contracts WHERE user_id = ? AND contract_type = 'service' AND status = 'signed'"
  ).get(userId);
  if (existing) {
    return res.json({
      message: '您已签署本服务协议',
      alreadySigned: true,
      contract: { id: existing.id, contract_no: existing.contract_no, signed_at: existing.signed_at },
    });
  }

  const contractNo = generateContractNo();
  const signedAt = new Date().toISOString();
  const signatureRaw = signature.replace(/^data:image\/\w+;base64,/, '');
  const snapshot = buildSnapshot({
    signerName: signer_name.trim(),
    signerPhone: signer_phone || '',
    signerIdcardMask: signer_idcard_mask || '',
    contractNo,
    signedAt,
  });
  const hash = computeHash(snapshot, signatureRaw);

  const result = db.prepare(`
    INSERT INTO contracts (
      user_id, contract_type, contract_no, title, signer_name, signer_phone,
      signer_idcard_mask, signature_image, contract_hash, content_snapshot,
      ip_address, user_agent, status, signed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'signed', ?)
  `).run(
    userId, 'service', contractNo, CONTRACT_TITLE, signer_name.trim(), signer_phone || '',
    signer_idcard_mask || '', signatureRaw, hash, snapshot,
    getClientIp(req), req.headers['user-agent'] || '', signedAt
  );

  res.json({
    message: '合同签署成功',
    alreadySigned: false,
    contract: { id: result.lastInsertRowid, contract_no: contractNo, signed_at: signedAt, contract_hash: hash },
  });
});

// ===== 鉴权：我的合同列表 =====
router.get('/', auth, (req, res) => {
  const contracts = db.prepare(`
    SELECT id, contract_type, contract_no, title, signer_name, signed_at, status
    FROM contracts WHERE user_id = ? ORDER BY signed_at DESC
  `).all(req.userId);
  res.json({ contracts });
});

// ===== 鉴权：合同详情（含快照与签名） =====
router.get('/:id', auth, (req, res) => {
  const contract = db.prepare('SELECT * FROM contracts WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!contract) {
    return res.status(404).json({ error: '合同不存在' });
  }
  const { signature_image, ...rest } = contract;
  res.json({
    contract: {
      ...rest,
      signature_image: signature_image ? `data:image/png;base64,${signature_image}` : '',
    },
  });
});

// ===== 凭证视图：支持 Authorization 头或 ?t=token 查询参数（便于新标签页直接打开） =====
router.get('/:id/view', (req, res) => {
  const token =
    req.query.t ||
    (req.headers['authorization'] || '').replace(/^Bearer\s+/, '');
  let userId = null;
  try {
    userId = jwt.verify(token, process.env.JWT_SECRET).userId;
  } catch (e) {
    userId = null;
  }
  if (!userId) {
    return res.status(401).send('<p style="text-align:center;padding:40px;color:#888;">请先登录后再查看合同</p>');
  }
  const contract = db.prepare('SELECT * FROM contracts WHERE id = ? AND user_id = ?').get(req.params.id, userId);
  if (!contract) {
    return res.status(404).send('<p style="text-align:center;padding:40px;">合同不存在</p>');
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(renderContractHtml(contract));
});

// ===== 渲染：可打印合同凭证 =====
function renderContractHtml(c) {
  const sigImg = c.signature_image
    ? `<img src="data:image/png;base64,${c.signature_image}" style="height:90px;" alt="签名"/>`
    : '（未见签名）';
  const previewHash = c.contract_hash.slice(0, 16) + '…' + c.contract_hash.slice(-16);

  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>电子合同凭证 - ${escapeHtml(c.contract_no)}</title>
<style>
  body{font-family:'PingFang SC','Microsoft YaHei',serif;color:#222;max-width:820px;margin:0 auto;padding:40px 28px;line-height:1.9;}
  h1{text-align:center;font-size:24px;border-bottom:2px solid #E8853A;padding-bottom:14px;}
  .meta{display:flex;justify-content:space-between;font-size:13px;color:#666;margin:18px 0;}
  .section{white-space:pre-wrap;font-size:14px;background:#FAF6F0;border:1px solid #F0E0D0;border-radius:8px;padding:18px;margin:16px 0;}
  .sign-box{margin-top:30px;display:flex;justify-content:space-between;align-items:flex-end;}
  .sign-box .info{font-size:14px;}
  .seal{border:2px solid #c0392b;color:#c0392b;border-radius:50%;width:120px;height:120px;display:flex;align-items:center;justify-content:center;text-align:center;font-size:13px;transform:rotate(-12deg);opacity:.85;}
  .verify{margin-top:24px;font-size:12px;color:#888;border-top:1px dashed #ccc;padding-top:14px;}
  .btn-print{position:fixed;top:16px;right:16px;background:#E8853A;color:#fff;border:none;padding:10px 18px;border-radius:8px;cursor:pointer;font-size:14px;}
  @media print{.btn-print{display:none;}}
</style></head>
<body>
  <button class="btn-print" onclick="window.print()">打印 / 另存为PDF</button>
  <h1>${escapeHtml(c.title)}</h1>
  <div class="meta">
    <span>合同编号：${escapeHtml(c.contract_no)}</span>
    <span>签署时间：${escapeHtml(c.signed_at)}</span>
  </div>
  <div class="section">${escapeHtml(c.content_snapshot)}</div>
  <div class="sign-box">
    <div class="info">
      签署人：${escapeHtml(c.signer_name)}<br>
      手机号：${escapeHtml(c.signer_phone || '（未填写）')}<br>
      证件尾号：${escapeHtml(c.signer_idcard_mask || '（未填写）')}
    </div>
    <div style="text-align:center;">
      ${sigImg}
      <div style="font-size:12px;color:#666;border-top:1px solid #999;margin-top:4px;padding-top:2px;">乙方手写电子签名</div>
    </div>
  </div>
  <div class="seal">余火·留声<br>电子合同专用章</div>
  <div class="verify">
    内容完整性哈希（SHA-256）：<br>${escapeHtml(c.contract_hash)}<br><br>
    本合同由「余火·留声」平台出具，哈希值可用于核验合同内容是否被篡改。验真地址：/api/contracts/verify/${escapeHtml(c.contract_no)}
  </div>
</body></html>`;
}

// ===== 渲染：公开验真页 =====
function renderVerifyHtml(c) {
  if (!c) {
    return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>合同验真</title>
<style>body{font-family:'PingFang SC',sans-serif;text-align:center;padding:60px 20px;color:#444;}</style></head>
<body><h2>未找到该合同</h2><p>请确认合同编号是否正确。</p></body></html>`;
  }
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>合同验真 - ${escapeHtml(c.contract_no)}</title>
<style>body{font-family:'PingFang SC',sans-serif;max-width:620px;margin:0 auto;padding:40px 24px;color:#222;line-height:1.9;}
h1{color:#E8853A;} .row{display:flex;justify-content:space-between;border-bottom:1px solid #eee;padding:10px 0;}
.ok{color:#388E3C;font-weight:600;}</style></head>
<body>
  <h1>电子合同验真</h1>
  <p>以下信息由「余火·留声」平台出具，可用于核验合同真实性。</p>
  <div class="row"><span>合同名称</span><b>${escapeHtml(c.title)}</b></div>
  <div class="row"><span>合同编号</span><b>${escapeHtml(c.contract_no)}</b></div>
  <div class="row"><span>签署人</span><b>${escapeHtml(c.signer_name)}</b></div>
  <div class="row"><span>签署时间</span><b>${escapeHtml(c.signed_at)}</b></div>
  <div class="row"><span>合同状态</span><b class="ok">${c.status === 'signed' ? '已签署生效' : escapeHtml(c.status)}</b></div>
  <div class="row"><span>内容哈希(SHA-256)</span><b style="font-size:11px;max-width:60%;word-break:break-all;text-align:right;">${escapeHtml(c.contract_hash)}</b></div>
  <p style="margin-top:24px;color:#888;font-size:13px;">比对哈希值即可确认合同内容自签署后未被篡改。</p>
</body></html>`;
}

module.exports = router;
