/**
 * 通知中心（可扩展）
 * --------------------------------------------------
 * 把"登记""投递"等事件编排成多渠道通知。
 *
 * 当前已注册渠道：email（邮件）
 * 未来扩展短信/站内信/微信模板消息：只需调用 registerChannel({ id, sendLeadConfirmation, sendLeadAlert })
 * 即可，无需改动任何业务路由 —— 事件编排会自动带上新渠道。
 */
const email = require('./email');

// 渠道注册表：每个渠道至少实现 sendLeadConfirmation / sendLeadAlert
const CHANNELS = {
  email: {
    id: 'email',
    async sendLeadConfirmation(lead) {
      return email.sendLeadConfirmation(lead);
    },
    async sendLeadAlert(lead) {
      return email.sendLeadNotification(lead);
    },
  },
};

// 注册新的通知渠道（供未来短信 / 推送等扩展）
function registerChannel(channel) {
  if (!channel || !channel.id || typeof channel.sendLeadConfirmation !== 'function') {
    throw new Error('通知渠道必须提供 id 与 sendLeadConfirmation() 方法');
  }
  CHANNELS[channel.id] = channel;
  console.log(`[Notify] 已注册通知渠道：${channel.id}`);
}

// 事件：登记成功 → 同时触发"本人确认"与"项目方提醒"
// 返回结构：{ confirm: 发送结果, alert: 发送结果 }
async function notifyLeadRegistered(lead) {
  const out = { confirm: null, alert: null };

  // 1) 发给登记人本人的卡片式确认
  try {
    out.confirm = await CHANNELS.email.sendLeadConfirmation(lead);
  } catch (e) {
    console.error('[Notify] 登记人确认邮件失败:', e.message);
    out.confirm = { error: e.message };
  }

  // 2) 发给项目运营邮箱的提醒
  try {
    out.alert = await CHANNELS.email.sendLeadAlert(lead);
  } catch (e) {
    console.error('[Notify] 项目方提醒邮件失败:', e.message);
    out.alert = { error: e.message };
  }

  return out;
}

module.exports = { notifyLeadRegistered, registerChannel, CHANNELS };
