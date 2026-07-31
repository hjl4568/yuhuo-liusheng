const nodemailer = require('nodemailer');

let transporter = null;
let testAccount = null;

// 启动时初始化：仅当配置了真实 SMTP 才建连；否则不发起任何网络请求（避免云端启动卡死/假账号）
function init() {
  const service = process.env.MAIL_SERVICE;
  const hasSmtp = service && service !== 'ethereal' && process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS;

  if (hasSmtp) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '465', 10),
      secure: parseInt(process.env.SMTP_PORT || '465', 10) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
    console.log(`[Mail] SMTP configured: ${process.env.SMTP_USER}`);
  } else if (service === 'ethereal') {
    // 仅本地开发：首次发送时再惰性创建 Ethereal 测试账号
    transporter = null;
    console.log('[Mail] MAIL_SERVICE=ethereal — 首次发送时惰性使用 Ethereal 测试账号（仅开发用）。');
  } else {
    transporter = null;
    console.log('[Mail] 未配置 SMTP — 邮件将被跳过。设置 MAIL_SERVICE + SMTP_* 后可启用发送。');
  }
}

async function ensureTransporter() {
  if (transporter) return true;
  const service = process.env.MAIL_SERVICE;
  const hasSmtp = service && service !== 'ethereal' && process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS;
  if (hasSmtp) {
    try {
      transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '465', 10),
        secure: parseInt(process.env.SMTP_PORT || '465', 10) === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });
      return true;
    } catch (e) {
      console.error('[Mail] 创建传输器失败:', e.message);
      return false;
    }
  }
  if (service === 'ethereal') {
    try {
      testAccount = await nodemailer.createTestAccount();
      transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: { user: testAccount.user, pass: testAccount.pass },
      });
      return true;
    } catch (e) {
      console.error('[Mail] Ethereal 初始化失败:', e.message);
      return false;
    }
  }
  return false;
}

function maskEmail(e) {
  if (!e || !e.includes('@')) return e || '';
  const [u, d] = e.split('@');
  const head = u.length <= 3 ? u[0] + '***' : u.slice(0, 3) + '***';
  return `${head}@${d}`;
}

// 返回当前邮件配置状态（供后台自检）
function getMailStatus() {
  const service = process.env.MAIL_SERVICE;
  const hasSmtp = service && service !== 'ethereal' && process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS;
  return {
    configured: !!transporter || !!hasSmtp,
    service: service || '(未设置)',
    user: process.env.SMTP_USER ? maskEmail(process.env.SMTP_USER) : '(未设置)',
    workMail: process.env.WORK_MAIL ? maskEmail(process.env.WORK_MAIL) : '(未设置)',
  };
}

// 主动发送一封测试信到通知邮箱，返回真实结果（供后台“一键测试”）
async function sendTestMail() {
  const ok = await ensureTransporter();
  if (!ok) {
    return { ok: false, error: '未配置可用邮件服务（请检查服务器 .env.prod 的 MAIL_SERVICE / SMTP_*）' };
  }
  const WORK_MAIL = process.env.WORK_MAIL || 'changyeyuhuo2026@163.com';
  try {
    const info = await transporter.sendMail({
      from: `"长夜余火" <${process.env.SMTP_USER}>`,
      to: WORK_MAIL,
      subject: '长夜余火 · 邮件配置测试',
      text: '这是一封测试邮件。如果你收到它，说明服务器邮件功能已正常工作。',
      html: '<p style="font-size:15px;line-height:1.8;">这是一封<b>测试邮件</b>。如果你收到它，说明服务器邮件功能已正常工作 🔥</p>',
    });
    return { ok: true, messageId: info.messageId };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function sendCapsuleEmail({ recipientName, recipientEmail, senderName, title, textContent, downloadUrl, viewUrl, relation }) {
  const ok = await ensureTransporter();
  if (!ok) {
    console.log('[Mail] sendCapsuleEmail 跳过：未配置可用邮件服务');
    return { skipped: true };
  }

  const greeting = relation ? `（来自您的${relation}）` : '';
  const html = `
    <div style="max-width:600px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#333;">
      <div style="background:linear-gradient(135deg,#E8853A,#D4691E);padding:30px;border-radius:12px 12px 0 0;text-align:center;">
        <h1 style="color:#fff;margin:0;font-size:24px;">余火·留声</h1>
        <p style="color:#FFE8D6;margin:8px 0 0;font-size:14px;">一封来自时间的信</p>
      </div>
      <div style="background:#FFF8F0;padding:30px;border-radius:0 0 12px 12px;border:1px solid #F0E0D0;">
        <p style="font-size:16px;">亲爱的 <strong>${recipientName}</strong>${greeting}：</p>
        <p style="font-size:14px;color:#666;">您收到一封来自 <strong>${senderName}</strong> 的时光胶囊，标题为「${title}」。</p>
        <div style="background:#fff;border:1px solid #F0E0D0;border-radius:8px;padding:20px;margin:20px 0;">
          ${textContent ? `<div style="white-space:pre-wrap;font-size:15px;line-height:1.8;color:#3D2817;">${textContent}</div>` : '<p style="color:#999;">（此胶囊包含录音/视频内容，请通过下方按钮查看）</p>'}
        </div>
        ${viewUrl ? `<p style="text-align:center;margin:20px 0;"><a href="${viewUrl}" style="display:inline-block;background:linear-gradient(135deg,#E8853A,#D4691E);color:#fff;text-decoration:none;padding:14px 38px;border-radius:8px;font-size:15px;font-weight:600;box-shadow:0 8px 20px rgba(232,133,58,0.35);">打开这封信 🔥</a></p>` : ''}
        ${downloadUrl ? `<p style="text-align:center;margin:8px 0 0;font-size:13px;"><a href="${downloadUrl}" style="color:#C0601E;text-decoration:underline;">或下载附件内容</a></p>` : ''}
        <hr style="border:none;border-top:1px solid #F0E0D0;margin:24px 0;">
        <p style="font-size:12px;color:#999;text-align:center;">此邮件由「余火·留声」系统自动发送<br/>请妥善保管这份来自时光的礼物</p>
      </div>
    </div>
  `;

  const info = await transporter.sendMail({
    from: `"余火·留声" <${testAccount ? testAccount.user : process.env.SMTP_USER}>`,
    to: recipientEmail,
    subject: `来自${senderName}的时光胶囊：${title}`,
    html,
  });

  let previewUrl = null;
  if (process.env.MAIL_SERVICE === 'ethereal' || !process.env.MAIL_SERVICE) {
    previewUrl = nodemailer.getTestMessageUrl(info);
  }

  return { messageId: info.messageId, previewUrl };
}

// 早期体验意向登记 → 通知到项目邮箱（后端上线且配置 SMTP 后自动送达）
async function sendLeadNotification({ name, phone, email, content_types, want_early, message }) {
  const ok = await ensureTransporter();
  if (!ok) {
    console.log('[Mail] sendLeadNotification 跳过：未配置可用邮件服务');
    return { skipped: true };
  }
  const WORK_MAIL = process.env.WORK_MAIL || 'changyeyuhuo2026@163.com';
  const row = (k, v) => `<tr><td style="padding:8px 12px;color:#888;font-size:13px;width:90px;vertical-align:top;">${k}</td><td style="padding:8px 12px;font-size:14px;color:#333;">${v || '（未填）'}</td></tr>`;
  const html = `
    <div style="max-width:560px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
      <div style="background:linear-gradient(135deg,#E8853A,#D4691E);padding:22px;border-radius:12px 12px 0 0;">
        <h2 style="color:#fff;margin:0;font-size:19px;">长夜余火 · 新的意向登记</h2>
      </div>
      <div style="background:#FFF8F0;padding:20px;border-radius:0 0 12px 12px;border:1px solid #F0E0D0;">
        <table style="border-collapse:collapse;width:100%;">
          ${row('称呼', name)}
          ${row('手机', phone)}
          ${row('邮箱', email)}
          ${row('想留内容', content_types)}
          ${row('早期体验', want_early ? '愿意' : '先了解')}
          ${row('留言', message)}
        </table>
        <p style="font-size:12px;color:#999;margin-top:16px;text-align:center;">此邮件由「长夜余火」系统自动发送</p>
      </div>
    </div>`;
  const info = await transporter.sendMail({
    from: `"长夜余火意向登记" <${process.env.SMTP_USER}>`,
    to: WORK_MAIL,
    subject: '长夜余火 · 新的早期体验意向登记',
    html,
  });
  return { messageId: info.messageId };
}

module.exports = { init, sendCapsuleEmail, sendLeadNotification, getMailStatus, sendTestMail };
