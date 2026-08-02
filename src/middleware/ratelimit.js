// 轻量内存速率限制器（无第三方依赖）
// 防止登录接口被暴力破解、公开写接口被刷。
// 注意：基于内存 Map，重启即清空；多实例部署需换 Redis，本项目单容器足够。

function rateLimit({ windowMs = 60 * 1000, max = 10, message = '请求过于频繁，请稍后再试' } = {}) {
  const hits = new Map(); // key -> [timestamp, ...]
  const timer = setInterval(() => hits.clear(), windowMs);
  if (timer && timer.unref) timer.unref();

  return function (req, res, next) {
    const clientIp = req.ip || (req.socket && req.socket.remoteAddress) || 'unknown';
    const key = clientIp + '|' + (req.originalUrl || req.url || '');
    const now = Date.now();
    const arr = hits.get(key) || [];
    const recent = arr.filter((t) => now - t < windowMs);
    recent.push(now);
    hits.set(key, recent);
    // 剩余可用次数提示（可选）
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - recent.length)));
    if (recent.length > max) {
      res.setHeader('Retry-After', String(Math.ceil(windowMs / 1000)));
      return res.status(429).json({ error: message });
    }
    next();
  };
}

module.exports = { rateLimit };
