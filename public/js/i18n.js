/* 长夜余火 · 前端多语言引擎
 * 用法：页面底部引入 i18n-data.js 与本文件即可。
 * 行为：默认中文；右上角浮动「中 / EN」切换；选择记到 localStorage；
 *       动态插入的内容（实时数据、赞赏流）通过 MutationObserver 自动翻译；
 *       用户生成内容（donor-list / lead-msg）跳过，不被改写。
 */
(function () {
  // 品牌 favicon 全站注入（兜底：页面 head 没手写 icon 时也保证浏览器标签有图标）
  (function () {
    try {
      if (document.querySelector('link[rel="icon"]')) return;
      const l = document.createElement('link');
      l.rel = 'icon';
      l.type = 'image/svg+xml';
      l.href = '/favicon.svg';
      document.head.appendChild(l);
    } catch (e) {}
  })();

  const STORE_KEY = 'i18n-lang';

  // 归一化：删除所有空白再比对，避免 HTML 缩进 / <em> 拆分 / 未来开发时的空格差异导致漏翻
  function norm(s) { return (s || '').replace(/\s+/g, '').replace(/\\/g, '').trim(); }

  // 把原始字典 key 也归一化，建立「无空白 key -> 译文」映射
  const RAW_MAP = window.I18N_MAP || {};
  const RAW_ATTR = window.I18N_ATTR || {};
  const MAP = {};
  for (const k in RAW_MAP) MAP[norm(k)] = RAW_MAP[k];
  const ATTR = {};
  for (const k in RAW_ATTR) ATTR[norm(k)] = RAW_ATTR[k];

  const SKIP_IDS = window.I18N_SKIP_IDS || [];

  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'INPUT', 'TEXTAREA', 'SELECT', 'OPTION']);
  let lang = (function () { try { return localStorage.getItem(STORE_KEY) || 'zh'; } catch (e) { return 'zh'; } })();
  let applying = false;

  function isSkipped(el) {
    if (!el) return false;
    if (SKIP_TAGS.has(el.tagName)) return true;
    if (el.closest && el.closest('#' + SKIP_IDS.join(', #'))) return true;
    return false;
  }

  function preserveWS(orig, out) {
    const lead = orig.slice(0, orig.length - orig.replace(/^\s+/, '').length);
    const trail = orig.slice(orig.replace(/\s+$/, '').length);
    return lead + out + trail;
  }

  function translateText(node) {
    if (node.__i18n_orig === undefined) node.__i18n_orig = node.nodeValue;
    const orig = node.__i18n_orig;
    if (!orig || !orig.trim()) return;
    if (lang === 'en') {
      const tr = MAP[norm(orig)];
      if (tr !== undefined) {
        const out = preserveWS(orig, tr);
        if (node.nodeValue !== out) node.nodeValue = out; // 跳过无变化写入，避免触发自身 MutationObserver 死循环
      }
    } else {
      if (node.nodeValue !== orig) node.nodeValue = orig;
    }
  }

  function translateAttrs(el) {
    ['placeholder', 'title', 'aria-label', 'alt'].forEach(function (a) {
      if (!el.hasAttribute(a)) return;
      const v = el.getAttribute(a);
      if (el.__i18n_attr_orig === undefined) el.__i18n_attr_orig = {};
      if (el.__i18n_attr_orig[a] === undefined) el.__i18n_attr_orig[a] = v;
      const orig = el.__i18n_attr_orig[a];
      if (lang === 'en') {
        const tr = ATTR[norm(orig)];
        if (tr !== undefined && el.getAttribute(a) !== tr) el.setAttribute(a, tr);
      } else {
        if (el.getAttribute(a) !== orig) el.setAttribute(a, orig);
      }
    });
  }

  function walk(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        if (!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        let p = n.parentNode;
        while (p) {
          if (SKIP_TAGS.has(p.tagName) || (p.id && SKIP_IDS.indexOf(p.id) !== -1)) return NodeFilter.FILTER_REJECT;
          p = p.parentNode;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes = [];
    let n;
    while ((n = walker.nextNode())) nodes.push(n);
    nodes.forEach(translateText);
  }

  function walkAttrs(root) {
    const els = root.querySelectorAll('*');
    els.forEach(function (el) {
      if (isSkipped(el)) return;
      translateAttrs(el);
    });
  }

  function apply() {
    applying = true;
    document.documentElement.lang = (lang === 'en') ? 'en' : 'zh-CN';
    walk(document.body || document.documentElement);
    walkAttrs(document.body || document.documentElement);
    // <title> 在 head，单独处理
    if (document.title && MAP[norm(document.title)]) {
      if (document.__title_orig === undefined) document.__title_orig = document.title;
      document.title = (lang === 'en') ? MAP[norm(document.__title_orig)] : document.__title_orig;
    }
    updateSwitcher();
    applying = false;
    // 通知动态内容（如生长之树）语言已切换，需要重新渲染
    window.dispatchEvent(new CustomEvent('i18n-lang-change', { detail: { lang: lang } }));
  }

  // ---------- 切换器样式（自注入，确保任意页面/样式表都生效） ----------
  const SWITCHER_CSS =
    '#i18n-switcher{position:fixed;right:16px;bottom:16px;z-index:9999;display:flex;gap:2px;' +
    'padding:4px;border-radius:24px;background:rgba(12,14,22,0.82);backdrop-filter:blur(10px);' +
    '-webkit-backdrop-filter:blur(10px);border:1px solid rgba(212,175,55,0.35);' +
    'box-shadow:0 6px 20px rgba(0,0,0,.45);font-family:var(--sans,system-ui,-apple-system,sans-serif);}' +
    '#i18n-switcher button{appearance:none;-webkit-appearance:none;border:0;background:transparent;cursor:pointer;' +
    'color:#cdd2e0;font-size:13px;line-height:1;padding:7px 12px;border-radius:18px;transition:all .2s;letter-spacing:1px;}' +
    '#i18n-switcher button:hover{color:#e9c96a;}' +
    '#i18n-switcher button.active{background:linear-gradient(135deg,#d4af37,#b8860b);color:#1a1206;font-weight:700;' +
    'box-shadow:0 2px 10px rgba(212,175,55,.4);}' +
    '@media (max-width:480px){#i18n-switcher{right:10px;bottom:10px;}#i18n-switcher button{padding:6px 10px;font-size:12px;}}';
  function injectStyle() {
    if (document.getElementById('i18n-switcher-style')) return;
    const st = document.createElement('style');
    st.id = 'i18n-switcher-style';
    st.textContent = SWITCHER_CSS;
    (document.head || document.documentElement).appendChild(st);
  }

  // ---------- 语言切换器 ----------
  let switcher = null;
  function buildSwitcher() {
    const s = document.createElement('div');
    s.id = 'i18n-switcher';
    s.innerHTML = '<button type="button" data-l="zh">中</button><button type="button" data-l="en">EN</button>';
    s.querySelectorAll('button').forEach(function (b) {
      b.addEventListener('click', function () {
        const l = b.getAttribute('data-l');
        if (l === lang) return;
        lang = l;
        try { localStorage.setItem(STORE_KEY, l); } catch (e) {}
        apply();
      });
    });
    document.body.appendChild(s);
    switcher = s;
  }
  function updateSwitcher() {
    if (!switcher) return;
    switcher.querySelectorAll('button').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-l') === lang);
    });
  }

  // ---------- 动态内容监听 ----------
  let observer = null;
  function startObserver() {
    if (!('MutationObserver' in window) || !document.body) return;
    observer = new MutationObserver(function (mutations) {
      if (applying) return;
      mutations.forEach(function (m) {
        if (m.type === 'childList') {
          m.addedNodes.forEach(function (node) {
            if (node.nodeType === 1) { walk(node); walkAttrs(node); }
            else if (node.nodeType === 3) translateText(node);
          });
        } else if (m.type === 'characterData' && m.target.nodeType === 3) {
          translateText(m.target);
        }
      });
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  // ---------- 启动 ----------
  function init() {
    injectStyle();
    buildSwitcher();
    apply();
    startObserver();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // 供其他脚本使用：window.I18N.t('中文') -> 英文（当前为英文时）
  window.I18N = {
    t: function (s) { return (lang === 'en' && MAP[norm(s)]) ? MAP[norm(s)] : s; },
    apply: apply,
    get lang() { return lang; }
  };
})();
