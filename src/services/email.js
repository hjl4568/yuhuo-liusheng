const nodemailer = require('nodemailer');

let transporter = null;
let testAccount = null;

async function init() {
  const service = process.env.MAIL_SERVICE || 'ethereal';

  if (service === 'ethereal') {
    testAccount = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });
    console.log(`[Mail] Ethereal test account: ${testAccount.user}`);
  } else {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '465'),
      secure: parseInt(process.env.SMTP_PORT || '465') === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
    console.log(`[Mail] SMTP configured: ${process.env.SMTP_USER}`);
  }
}

async function sendCapsuleEmail({ recipientName, recipientEmail, senderName, title, textContent, downloadUrl, relation }) {
  if (!transporter) {
    await init();
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
          ${textContent ? `<div style="white-space:pre-wrap;font-size:15px;line-height:1.8;color:#3D2817;">${textContent}</div>` : '<p style="color:#999;">（此胶囊包含录音/视频内容，请通过下方链接查看）</p>'}
        </div>
        ${downloadUrl ? `<p style="text-align:center;margin:20px 0;"><a href="${downloadUrl}" style="display:inline-block;background:#E8853A;color:#fff;text-decoration:none;padding:12px 32px;border-radius:6px;font-size:14px;">查看附件内容</a></p>` : ''}
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

  return {
    messageId: info.messageId,
    previewUrl,
  };
}

module.exports = { init, sendCapsuleEmail };
