const base = 'http://localhost:3000';
async function post(path, body) {
  const r = await fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: r.status, text: await r.text() };
}
async function get(path) {
  const r = await fetch(base + path);
  return { status: r.status, json: await r.json().catch(() => null) };
}
(async () => {
  console.log('visit1', JSON.stringify(await post('/api/visit', {})));
  console.log('visit2', JSON.stringify(await post('/api/visit', {})));
  console.log('leads', JSON.stringify(await post('/api/leads', { name: '测试用户', content_types: ['文字', '录音'], want_early: true })));
  console.log('donors', JSON.stringify(await post('/api/donors', { amount: 20, message: '加油长夜余火' })));
  const s = await get('/api/stats/public');
  console.log('stats', s.status, JSON.stringify(s.json));
})();
