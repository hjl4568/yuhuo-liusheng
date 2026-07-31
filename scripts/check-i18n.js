/* 长夜余火 · i18n 守门员（精确版，用 jsdom 模拟 i18n 引擎的真实文本遍历）
 * 只列出「i18n 引擎实际会遇到、但字典里没有」的中文文本节点，避免把含 <em>/<br> 的整段误报。
 * 用法：NODE_PATH=<node_modules> node scripts/check-i18n.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const DATA_FILE = path.join(PUBLIC, 'js', 'i18n-data.js');

// ---------- 1. 读取现有字典键（trim 后）----------
const dataSrc = fs.readFileSync(DATA_FILE, 'utf8');
const norm = s => s.replace(/\s+/g, '').replace(/\\/g, '').trim();
const dictKeys = new Set();
const keyRe = /"((?:[^"\\]|\\.)*)"\s*:/g;
let m;
while ((m = keyRe.exec(dataSrc)) !== null) dictKeys.add(norm(m[1]));

// 提取 skipIds（与 i18n.js 一致）
const skipMatch = dataSrc.match(/skipIds\s*=\s*\[([^\]]*)\]/);
const skipIds = new Set(
  (skipMatch ? skipMatch[1] : '')
    .split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
);

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'INPUT', 'TEXTAREA', 'SELECT', 'OPTION']);

// ---------- 2. 用 jsdom 模拟 i18n 遍历每个 HTML ----------
const HTML_FILES = fs.readdirSync(PUBLIC).filter(f => f.endsWith('.html'));
const missing = new Map(); // text -> [files]
const hasCJK = s => /[一-鿿]/.test(s);

function inSkipContainer(node) {
  let p = node.parentNode;
  while (p) {
    if (p.id && skipIds.has(p.id)) return true;
    p = p.parentNode;
  }
  return false;
}

for (const file of HTML_FILES) {
  const html = fs.readFileSync(path.join(PUBLIC, file), 'utf8');
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const walker = doc.createTreeWalker(doc.body, dom.window.NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue || !node.nodeValue.trim()) return dom.window.NodeFilter.FILTER_REJECT;
      let p = node.parentNode;
      while (p && p !== doc.body) {
        if (SKIP_TAGS.has(p.tagName)) return dom.window.NodeFilter.FILTER_REJECT;
        if (p.id && skipIds.has(p.id)) return dom.window.NodeFilter.FILTER_REJECT;
        p = p.parentNode;
      }
      return dom.window.NodeFilter.FILTER_ACCEPT;
    }
  });
  let n;
  while ((n = walker.nextNode())) {
    const text = n.nodeValue.trim();
    if (!text || !hasCJK(text)) continue;
    if (!/[一-鿿a-zA-Z0-9]/.test(text)) continue; // 纯标点跳过
    if (dictKeys.has(norm(text))) continue;
    if (!missing.has(text)) missing.set(text, new Set());
    missing.get(text).add(file);
  }
}

// ---------- 3. 输出 ----------
if (missing.size === 0) {
  console.log('✅ i18n 检查通过：所有页面实际可见中文都已在字典中。');
  process.exit(0);
}
console.log(`\n⚠️  发现 ${missing.size} 条「引擎会遇到但字典缺失」的中文：\n`);
const lines = [];
for (const [text, files] of missing) {
  lines.push(`  • ${JSON.stringify(text)}  [${[...files].join(', ')}]`);
}
console.log(lines.join('\n'));
console.log(`\n共 ${missing.size} 条。补全 public/js/i18n-data.js 后重跑。`);
process.exit(1);
