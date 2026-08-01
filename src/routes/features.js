const express = require('express');
const { getSmsStatus } = require('../services/sms');

const router = express.Router();

// 对外暴露「功能开关 / 预留状态」，前端据此展示「即将上线」等提示
// 未来新增预留功能（如微信模板消息、站内信）时，在此统一登记即可
router.get('/', (req, res) => {
  res.json({
    sms: getSmsStatus(),
  });
});

module.exports = router;
