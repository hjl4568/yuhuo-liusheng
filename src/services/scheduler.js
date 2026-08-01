const cron = require('node-cron');
const { db } = require('../db');
const { sendCapsuleEmail } = require('./email');
const { sendSms } = require('./sms');
const { decryptFile } = require('./crypto');
const path = require('path');
const fs = require('fs');

let schedulerStarted = false;

// 解析胶囊的收件人列表；兼容旧版单收件人字段
function parseRecipients(capsule) {
  let list = [];
  if (capsule.recipients_json) {
    try { list = JSON.parse(capsule.recipients_json); } catch (e) { list = []; }
  }
  if (!Array.isArray(list) || !list.length) {
    // 旧版兼容：退化为单收件人（邮件）
    if (capsule.recipient_email) {
      list = [{
        name: capsule.recipient_name || '',
        relation: capsule.recipient_relation || '',
        method: 'email',
        contact: capsule.recipient_email,
      }];
    }
  }
  return list;
}

async function deliverCapsule(capsule, operator = 'system') {
  if (capsule.status === 'delivered' || capsule.status === 'cancelled') {
    return { success: false, message: '胶囊已送达或已取消' };
  }

  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(capsule.user_id);
    if (!user) throw new Error('用户不存在');

    const baseUrl = process.env.APP_URL || 'http://localhost:3000';
    let downloadUrl = '';
    if (capsule.file_path) {
      downloadUrl = `${baseUrl}/api/capsules/${capsule.id}/download?t=${capsule.capsule_code}`;
    }
    // 收件人查看页（无需登录，主动送达闭环）：/view.html?c=view_token
    const viewUrl = `${baseUrl}/view.html?c=${capsule.view_token}`;

    const recipients = parseRecipients(capsule);
    if (!recipients.length) {
      throw new Error('胶囊没有任何收件人');
    }

    // 逐收件人投递；不同方式走不同通道
    let emailDelivered = 0;   // 真正发出的邮件数
    let reservedCount = 0;    // 短信 / 实物 / 自定义 等「预留 / 待人工」数
    let firstPreviewUrl = null;

    for (const r of recipients) {
      const name = r.name || '';
      const contact = r.contact || '';
      const method = (r.method || 'email').toLowerCase();

      if (method === 'email') {
        if (!contact) continue;
        try {
          const result = await sendCapsuleEmail({
            recipientName: name,
            recipientEmail: contact,
            senderName: user.name || user.phone,
            title: capsule.title,
            textContent: capsule.text_content,
            downloadUrl,
            viewUrl,
            relation: r.relation || '',
          });
          emailDelivered++;
          if (!firstPreviewUrl && result.previewUrl) firstPreviewUrl = result.previewUrl;
          db.prepare(`
            INSERT INTO delivery_logs (capsule_id, send_method, recipient, status, operator, sent_at)
            VALUES (?, 'email', ?, 'success', ?, datetime('now'))
          `).run(capsule.id, contact, operator);
        } catch (e) {
          db.prepare(`
            INSERT INTO delivery_logs (capsule_id, send_method, recipient, status, error_message, operator, sent_at)
            VALUES (?, 'email', ?, 'failed', ?, ?, datetime('now'))
          `).run(capsule.id, contact, e.message, operator);
        }
      } else if (method === 'sms') {
        // 短信：预留功能，不实际发送，登记为 reserved
        const smsRes = await sendSms({ name, phone: contact, title: capsule.title, viewUrl });
        reservedCount++;
        db.prepare(`
          INSERT INTO delivery_logs (capsule_id, send_method, recipient, status, error_message, operator, sent_at)
          VALUES (?, 'sms', ?, 'reserved', ?, ?, datetime('now'))
        `).run(capsule.id, contact, smsRes.message, operator);
      } else {
        // physical（实物寄递）/ custom（自定义方式）：需人工安排，登记为 reserved
        reservedCount++;
        const note = method === 'physical' ? '实物寄递需人工安排（快递/EMS）' : '自定义投递方式需人工沟通安排';
        db.prepare(`
          INSERT INTO delivery_logs (capsule_id, send_method, recipient, status, error_message, operator, sent_at)
          VALUES (?, ?, ?, 'reserved', ?, ?, datetime('now'))
        `).run(capsule.id, method, contact || '(无联系方式)', note, operator);
      }
    }

    // 状态判定：只要有邮件成功发出即视为「已送达」；否则保持 pending（仍有预留项待补发/人工）
    if (emailDelivered > 0) {
      db.prepare(`
        UPDATE capsules SET status = 'delivered', updated_at = datetime('now') WHERE id = ?
      `).run(capsule.id);
    }

    console.log(
      `[Scheduler] Capsule #${capsule.id} -> email ${emailDelivered} 成功, 预留/人工 ${reservedCount} 项` +
      (firstPreviewUrl ? ` | Preview: ${firstPreviewUrl}` : '')
    );

    const success = emailDelivered > 0;
    return {
      success,
      previewUrl: firstPreviewUrl,
      viewUrl,
      emailDelivered,
      reservedCount,
      message: success
        ? (reservedCount > 0 ? '邮件已发送，部分收件人为预留/人工方式待补发' : '邮件已发送')
        : '暂无可发送的邮件收件人（其余为预留/人工方式）',
    };
  } catch (err) {
    console.error(`[Scheduler] Failed to deliver capsule #${capsule.id}:`, err.message);
    return { success: false, error: err.message };
  }
}

function start() {
  if (schedulerStarted) return;
  schedulerStarted = true;

  cron.schedule('* * * * *', async () => {
    try {
      const pending = db.prepare(`
        SELECT * FROM capsules
        WHERE status = 'pending'
          AND trigger_type = 'scheduled'
          AND trigger_date IS NOT NULL
          AND trigger_date <= datetime('now')
      `).all();

      for (const capsule of pending) {
        await deliverCapsule(capsule, 'system');
      }

      if (pending.length > 0) {
        console.log(`[Scheduler] Processed ${pending.length} scheduled capsules`);
      }
    } catch (err) {
      console.error('[Scheduler] Error:', err.message);
    }
  });

  console.log('[Scheduler] Started — checking every minute');
}

module.exports = { start, deliverCapsule };
