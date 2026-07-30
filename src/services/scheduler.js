const cron = require('node-cron');
const { db } = require('../db');
const { sendCapsuleEmail } = require('./email');
const { decryptFile } = require('./crypto');
const path = require('path');
const fs = require('fs');

let schedulerStarted = false;

async function deliverCapsule(capsule, operator = 'system') {
  if (capsule.status === 'delivered' || capsule.status === 'cancelled') {
    return { success: false, message: '胶囊已送达或已取消' };
  }

  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(capsule.user_id);
    if (!user) throw new Error('用户不存在');

    let downloadUrl = '';
    if (capsule.file_path) {
      downloadUrl = `${process.env.APP_URL || 'http://localhost:3000'}/api/capsules/${capsule.id}/download?t=${capsule.capsule_code}`;
    }

    const result = await sendCapsuleEmail({
      recipientName: capsule.recipient_name,
      recipientEmail: capsule.recipient_email,
      senderName: user.name || user.phone,
      title: capsule.title,
      textContent: capsule.text_content,
      downloadUrl,
      relation: capsule.recipient_relation,
    });

    db.prepare(`
      UPDATE capsules SET status = 'delivered', updated_at = datetime('now') WHERE id = ?
    `).run(capsule.id);

    db.prepare(`
      INSERT INTO delivery_logs (capsule_id, send_method, recipient, status, operator, sent_at)
      VALUES (?, 'email', ?, 'success', ?, datetime('now'))
    `).run(capsule.id, capsule.recipient_email, operator);

    console.log(`[Scheduler] Capsule #${capsule.id} delivered to ${capsule.recipient_email}`);
    if (result.previewUrl) {
      console.log(`[Scheduler] Preview URL: ${result.previewUrl}`);
    }

    return { success: true, previewUrl: result.previewUrl };
  } catch (err) {
    console.error(`[Scheduler] Failed to deliver capsule #${capsule.id}:`, err.message);

    db.prepare(`
      INSERT INTO delivery_logs (capsule_id, send_method, recipient, status, error_message, operator, sent_at)
      VALUES (?, 'email', ?, 'failed', ?, ?, datetime('now'))
    `).run(capsule.id, capsule.recipient_email, err.message, operator);

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
