/**
 * 短信通知 · 预留通道（RESERVED）
 * --------------------------------------------------
 * 当前定位：短信为「预留功能」，正式商业化阶段才上线。
 * 在预留期，选择短信的收件人不会真正收到短信，只会以 `reserved` 状态记入投递日志，
 * 上线后由运营一次性补发（或自动补发，视实现而定）。
 *
 * 上线步骤（未来）：
 *   1. 接入阿里云 / 腾讯云短信 SDK（安装依赖并在下方 sendSms 内实现真实发送）。
 *   2. 把 SMS_RESERVED 改为 false。
 *   3. 在 .env 配置 SMS_PROVIDER / SMS_ACCESS_KEY / SMS_SIGN_NAME / SMS_TEMPLATE_CODE。
 * 调用方（scheduler / notifications）无需任何改动 —— 接口签名保持稳定。
 */
const SMS_RESERVED = true;

/**
 * 发送短信（预留实现）
 * @param {{name?:string, phone:string, title?:string, viewUrl?:string}} opts
 * @returns {Promise<{reserved:boolean, delivered:boolean, message:string}>}
 */
async function sendSms({ name, phone, title, viewUrl }) {
  if (SMS_RESERVED) {
    console.log(
      `[SMS:reserved] 短信通道暂未开放，记录为预留 -> 收件人 ${name || ''} ${phone}（${title || '胶囊'}）`
    );
    return {
      reserved: true,
      delivered: false,
      message: '短信通道为预留功能，商业化后正式上线',
    };
  }

  // ===== 正式上线后的真实实现占位（示例结构，未启用） =====
  // const client = createSmsClient(process.env.SMS_PROVIDER);
  // const res = await client.send({
  //   phone,
  //   signName: process.env.SMS_SIGN_NAME,
  //   templateCode: process.env.SMS_TEMPLATE_CODE,
  //   templateParam: JSON.stringify({ name: name || '朋友', title: title || '一封信', url: viewUrl || '' }),
  // });
  // return { reserved: false, delivered: res.success, message: res.message };
  return { reserved: false, delivered: false, message: '未配置短信服务商' };
}

/**
 * 对外暴露短信通道状态（供前端 /api/features 展示）
 */
function getSmsStatus() {
  return {
    available: false,
    reserved: SMS_RESERVED,
    note:
      '短信通知为预留功能，正式商业化阶段上线。当前选择短信的收件人将以「预留」状态记录，上线后自动补发。',
    provider: SMS_RESERVED ? null : process.env.SMS_PROVIDER || null,
  };
}

module.exports = { sendSms, getSmsStatus, SMS_RESERVED };
