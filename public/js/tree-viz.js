/* ============================================================
   长夜余火 · 生长之树 — 数据驱动的实时树形可视化
   读取 /api/stats/public，根据访问量/注册量/胶囊数生成 SVG 树
   ============================================================ */
(function () {
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var svg = document.getElementById('tree-svg');
  if (!svg) return;

  var particlesContainer = document.getElementById('tree-particles');

  /* ---- 确定性随机（相同数据 = 相同树形） ---- */
  function makeRng(seed) {
    var s = seed % 2147483647;
    if (s <= 0) s += 2147483646;
    return function () {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
  }

  /* ---- i18n 辅助 ---- */
  function t(s) {
    return (window.I18N && typeof window.I18N.t === 'function') ? window.I18N.t(s) : s;
  }

  /* ---- 量级判定（按真实总互动量）
   * 自然转化漏斗：访问 : 登记 : 胶囊 ≈ 10 : 5 : 1
   *   - 访问（树干）：人人可来，体量最大、最随意
   *   - 登记（枝叶）：愿意留下信息，是中间层、需要一点 commitment
   *   - 胶囊（果实·树冠）：真正留内容的人最少，却是最难、最高的一级
   * 树的"大小/阶段"只由真实数字之和决定：总互动量 = 访问 + 登记 + 胶囊。
   * 不再使用任何人为加权，避免把小数据包装成"加权值 188 / 参与度 96%"这类虚假繁荣。
   * 量级：萌芽期(0-50) / 生长期(50-500) / 繁茂期(500-5k) / 森林期(5k+)
   */
  function getEra(total) {
    if (total < 50) return { ceiling: 50, name: '萌芽期', index: 0 };
    if (total < 500) return { ceiling: 500, name: '生长期', index: 1 };
    if (total < 5000) return { ceiling: 5000, name: '繁茂期', index: 2 };
    return { ceiling: 50000, name: '森林期', index: 3 };
  }

  /* ---- 生长阶段 ---- */
  function getStage(ratio) {
    if (ratio < 0.05) return { name: '种子', depth: 0, trunkLen: 6, trunkW: 1, baseLeaves: 0, baseFruit: 0 };
    if (ratio < 0.15) return { name: '萌芽', depth: 1, trunkLen: 22, trunkW: 2, baseLeaves: 2, baseFruit: 0 };
    if (ratio < 0.30) return { name: '树苗', depth: 2, trunkLen: 48, trunkW: 3.5, baseLeaves: 6, baseFruit: 1 };
    if (ratio < 0.60) return { name: '小树', depth: 3, trunkLen: 78, trunkW: 5.5, baseLeaves: 14, baseFruit: 3 };
    return { name: '大树', depth: 4, trunkLen: 108, trunkW: 7.5, baseLeaves: 28, baseFruit: 6 };
  }

  /* ---- SVG 辅助 ---- */
  function el(name, attrs) {
    var e = document.createElementNS(SVG_NS, name);
    if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  /* ---- 绘制 defs（渐变） ---- */
  function drawDefs() {
    var defs = el('defs');
    // 树干渐变
    var tg = el('linearGradient', { id: 'trunk-grad', x1: '0', y1: '0', x2: '1', y2: '0' });
    tg.appendChild(el('stop', { offset: '0%', 'stop-color': '#5A4A3A' }));
    tg.appendChild(el('stop', { offset: '50%', 'stop-color': '#8B7355' }));
    tg.appendChild(el('stop', { offset: '100%', 'stop-color': '#5A4A3A' }));
    defs.appendChild(tg);
    // 地面渐变
    var gg = el('radialGradient', { id: 'ground-grad', cx: '50%', cy: '50%', r: '50%' });
    gg.appendChild(el('stop', { offset: '0%', 'stop-color': 'rgba(90,74,58,0.35)' }));
    gg.appendChild(el('stop', { offset: '100%', 'stop-color': 'rgba(90,74,58,0)' }));
    defs.appendChild(gg);
    // 叶子渐变
    var lg = el('radialGradient', { id: 'leaf-grad', cx: '30%', cy: '30%', r: '70%' });
    lg.appendChild(el('stop', { offset: '0%', 'stop-color': '#9FD49F' }));
    lg.appendChild(el('stop', { offset: '100%', 'stop-color': '#5B9D6B' }));
    defs.appendChild(lg);
    // 果实渐变
    var fg = el('radialGradient', { id: 'fruit-grad', cx: '30%', cy: '30%', r: '70%' });
    fg.appendChild(el('stop', { offset: '0%', 'stop-color': '#FFD4A0' }));
    fg.appendChild(el('stop', { offset: '100%', 'stop-color': '#D47A4E' }));
    defs.appendChild(fg);
    return defs;
  }

  /* ---- 绘制地面 ---- */
  function drawGround(parent) {
    parent.appendChild(el('ellipse', {
      cx: 200, cy: 295, rx: 120, ry: 14,
      fill: 'url(#ground-grad)'
    }));
    parent.appendChild(el('line', {
      x1: 80, y1: 292, x2: 320, y2: 292,
      stroke: 'rgba(139,115,85,0.25)', 'stroke-width': 1
    }));
  }

  /* ---- 绘制种子 ---- */
  function drawSeed(parent, cx, cy, rng) {
    // 小土堆上的种子点
    parent.appendChild(el('ellipse', {
      cx: cx, cy: cy - 2, rx: 5, ry: 3,
      fill: '#6B5B45', opacity: 0.8
    }));
    parent.appendChild(el('circle', {
      cx: cx, cy: cy - 4, r: 3,
      fill: '#8FBC8F', class: 'seed-dot'
    }));
    // 两片小芽叶
    parent.appendChild(el('ellipse', {
      cx: cx - 4, cy: cy - 10, rx: 4, ry: 7,
      fill: '#8FBC8F', opacity: 0.85,
      transform: 'rotate(-25 ' + (cx - 4) + ' ' + (cy - 10) + ')'
    }));
    parent.appendChild(el('ellipse', {
      cx: cx + 4, cy: cy - 10, rx: 4, ry: 7,
      fill: '#8FBC8F', opacity: 0.85,
      transform: 'rotate(25 ' + (cx + 4) + ' ' + (cy - 10) + ')'
    }));
  }

  /* ---- 绘制根 ---- */
  function drawRoots(parent, cx, gy, rng, strength) {
    var rootCount = 3 + Math.floor(rng() * 2);
    for (var i = 0; i < rootCount; i++) {
      var angle = (i - (rootCount - 1) / 2) * 0.5;
      var len = (15 + rng() * 15) * strength;
      var ex = cx + Math.sin(angle) * len;
      var ey = gy + Math.abs(Math.cos(angle)) * len * 0.4;
      parent.appendChild(el('path', {
        d: 'M' + cx + ',' + gy + ' Q' + (cx + Math.sin(angle) * len * 0.5) + ',' + (gy + 3) + ' ' + ex + ',' + ey,
        class: 'root',
        'stroke-width': 1.5 * strength
      }));
    }
  }

  /* ---- 绘制叶子 ---- */
  function drawLeaf(parent, x, y, rng, index) {
    var size = 3 + rng() * 3;
    var rot = rng() * 360;
    parent.appendChild(el('ellipse', {
      cx: x, cy: y, rx: size, ry: size * 1.6,
      fill: 'url(#leaf-grad)',
      opacity: 0.75 + rng() * 0.25,
      transform: 'rotate(' + rot + ' ' + x + ' ' + y + ')',
      class: 'leaf',
      style: 'animation-delay:' + (index * 0.05) + 's'
    }));
  }

  /* ---- 绘制果实 ---- */
  function drawFruit(parent, x, y, rng, index) {
    parent.appendChild(el('circle', {
      cx: x, cy: y, r: 3.5 + rng() * 2,
      fill: 'url(#fruit-grad)',
      class: 'fruit',
      style: 'animation-delay:' + (index * 0.3) + 's'
    }));
    // 小高光
    parent.appendChild(el('circle', {
      cx: x - 1, cy: y - 1, r: 1,
      fill: 'rgba(255,255,255,0.5)',
      opacity: 0.6
    }));
  }

  /* ---- 递归绘制树枝 ---- */
  function drawBranch(parent, x, y, length, angle, depth, thickness, rng, params, leafIndex) {
    if (depth <= 0 || length < 2) return leafIndex;

    var ex = x + Math.cos(angle) * length;
    var ey = y + Math.sin(angle) * length;

    // 控制点（让树枝有弧度）
    var curveOffset = (rng() - 0.5) * 10;
    var cx = (x + ex) / 2 + Math.cos(angle + Math.PI / 2) * curveOffset;
    var cy = (y + ey) / 2 + Math.sin(angle + Math.PI / 2) * curveOffset;

    parent.appendChild(el('path', {
      d: 'M' + x + ',' + y + ' Q' + cx + ',' + cy + ' ' + ex + ',' + ey,
      class: 'trunk',
      'stroke-width': thickness
    }));

    // 在枝头放叶子
    if (depth <= 2 && params.leafCount > 0) {
      var leavesAtTip = Math.min(params.leafCount, 4);
      for (var i = 0; i < leavesAtTip; i++) {
        var lx = ex + (rng() - 0.5) * 18;
        var ly = ey + (rng() - 0.5) * 18;
        drawLeaf(parent, lx, ly, rng, leafIndex++);
      }
    }

    // 在最末端放果实
    if (depth <= 1 && params.fruitCount > 0) {
      var fruitAtTip = Math.min(params.fruitCount, 2);
      for (var j = 0; j < fruitAtTip; j++) {
        var fx = ex + (rng() - 0.5) * 12;
        var fy = ey + (rng() - 0.5) * 12 + 3;
        drawFruit(parent, fx, fy, rng, leafIndex++);
      }
    }

    // 递归子枝
    var numBranches = depth > 2 ? 2 + (rng() > 0.6 ? 1 : 0) : (rng() > 0.35 ? 2 : 1);
    for (var k = 0; k < numBranches; k++) {
      var spread = 0.35 + rng() * 0.25;
      var childAngle = angle + (k - (numBranches - 1) / 2) * spread + (rng() - 0.5) * 0.15;
      var childLen = length * (0.62 + rng() * 0.13);
      var childThick = thickness * 0.68;
      leafIndex = drawBranch(parent, ex, ey, childLen, childAngle, depth - 1, childThick, rng, params, leafIndex);
    }

    return leafIndex;
  }

  /* ---- 创建飘浮粒子 ---- */
  function createParticles(count) {
    if (!particlesContainer) return;
    particlesContainer.innerHTML = '';
    for (var i = 0; i < count; i++) {
      var p = document.createElement('span');
      p.style.left = (10 + Math.random() * 80) + '%';
      p.style.bottom = (Math.random() * 40) + '%';
      p.style.animationDuration = (4 + Math.random() * 6) + 's';
      p.style.animationDelay = -Math.random() * 6 + 's';
      p.style.opacity = 0.3 + Math.random() * 0.3;
      particlesContainer.appendChild(p);
    }
  }

  /* ---- 主渲染函数 ---- */
  function renderTree(data) {
    var visits = data.totalVisits || 0;
    // "登记" = 意向登记表单提交数（leads），不再把注册用户混进来，避免口径重复/虚高
    var regs = data.leadsTotal || 0;
    var caps = data.capsulesTotal || 0;

    // 树的大小只由真实总互动量决定，没有任何人为加权
    var total = visits + regs + caps;
    var era = getEra(total);
    var ratio = total / era.ceiling;
    var stage = getStage(ratio);

    // 种子用于确定性随机
    var rng = makeRng(visits * 1000 + regs * 100 + caps + 7);

    // 清空 SVG
    svg.innerHTML = '';
    svg.appendChild(drawDefs());

    var treeGroup = el('g', { class: 'tree-sway' });
    svg.appendChild(treeGroup);

    drawGround(treeGroup);

    var cx = 200, gy = 290;

    if (stage.depth === 0) {
      // 种子阶段（weighted 太小，连芽都没冒）
      drawSeed(treeGroup, cx, gy, rng);
    } else {
      // 绘制根（强度按 weighted 在 era 中的占比）
      drawRoots(treeGroup, cx, gy, rng, Math.min(ratio * 2, 1));

      // 树干：粗细由 visits 决定（独立换算，按对数缩放避免量级悬殊）
      // log10(1)=0, log10(10)=1, log10(100)=2, log10(1000)=3, log10(10000)=4
      var visitScore = Math.log10(visits + 1);     // 0..n
      var visitLevel = Math.min(visitScore / 4, 1); // 4=10000 访问视为满
      var trunkLen = stage.trunkLen * (0.55 + 0.45 * visitLevel);
      var trunkW = stage.trunkW * (0.55 + 0.45 * visitLevel);

      // 枝叶：数量由 regs 决定
      var regScore = Math.log10(regs + 1);
      var regLevel = Math.min(regScore / 3, 1); // 3=1000 登记视为满
      var leafCount = Math.round(stage.baseLeaves * (0.3 + 0.7 * regLevel));

      // 果实：数量由 caps 决定（线性，胶囊最珍贵所以 1 个也算）
      var capScore = Math.log10(caps + 1);
      var capLevel = Math.min(capScore / 2, 1); // 2=100 胶囊视为满
      var fruitCount = Math.round(stage.baseFruit * (0.3 + 0.7 * capLevel));
      if (caps > 0 && stage.depth >= 2 && fruitCount < 1) fruitCount = 1;

      var params = { leafCount: leafCount, fruitCount: fruitCount };

      // 绘制树干和枝叶
      drawBranch(treeGroup, cx, gy, trunkLen, -Math.PI / 2, stage.depth, trunkW, rng, params, 0);
    }

    // 更新统计数字（全部来自真实数据库，不含任何合成指标）
    var locale = (window.I18N && window.I18N.lang === 'en') ? 'en-US' : 'zh-CN';
    setText('ts-visits', visits.toLocaleString(locale));
    setText('ts-regs', regs.toLocaleString(locale));
    setText('ts-caps', caps.toLocaleString(locale));

    // 总互动量：三个真实数字的简单求和，作为树的量级依据
    setText('ts-total', total.toLocaleString(locale));

    // 转化漏斗：访问 → 登记 → 胶囊（目标 10 : 5 : 1，胶囊为最高一级）
    renderFunnel(visits, regs, caps);

    // 更新阶段信息
    var badge = document.getElementById('tree-era-badge');
    if (badge) {
      badge.className = 'era-badge era-' + era.index;
      badge.textContent = t(era.name);
    }
    setText('tree-stage-name', t(stage.name));

    // 量级文字
    var lower = era.index === 0 ? 0 : [50, 500, 5000][era.index - 1];
    setText('tree-scale-text', t('当前量级：' + lower + ' — ' + era.ceiling));

    // 粒子（大树阶段才有）
    createParticles(stage.depth >= 3 ? 8 : (stage.depth >= 2 ? 4 : 0));
  }

  function setText(id, text) {
    var e = document.getElementById(id);
    if (e) e.textContent = text;
  }

  /* ---- 转化漏斗可视化：访问 → 登记 → 胶囊 = 目标 10 : 5 : 1 ----
   * 三个层级：访问（基础，最宽）、登记（中层）、胶囊（最高一级，最窄）。
   * 用归一化宽度表现"越往上越难、越少"，并标注设计目标 10:5:1。
   */
  function renderFunnel(visits, regs, caps) {
    var box = document.getElementById('tree-funnel');
    if (!box) return;
    var locale = (window.I18N && window.I18N.lang === 'en') ? 'en-US' : 'zh-CN';
    // 归一化：以最大值为满宽（访问通常最大），体现漏斗收窄
    var maxV = Math.max(visits, regs, caps, 1);
    var wVisit = Math.round((visits / maxV) * 100);
    var wReg = Math.round((regs / maxV) * 100);
    var wCap = Math.round((caps / maxV) * 100);
    // 漏斗达成度：实际胶囊占访问比 vs 目标 1/10；登记占访问比 vs 目标 5/10
    var capRate = visits > 0 ? (caps / visits) : 0;     // 目标 0.10
    var regRate = visits > 0 ? (regs / visits) : 0;     // 目标 0.50
    var targetText = t('目标漏斗 10 : 5 : 1');
    var rateText = visits > 0
      ? (t('当前') + ' ' + (regRate * 100).toFixed(0) + '% / ' + (capRate * 100).toFixed(0) + '%')
      : (t('当前 — / —'));

    box.innerHTML =
      '<div class="fn-row fn-visit"><div class="fn-bar" style="width:' + wVisit + '%"></div>' +
        '<span class="fn-label">' + t('访问') + ' ' + visits.toLocaleString(locale) + '</span></div>' +
      '<div class="fn-row fn-reg"><div class="fn-bar" style="width:' + wReg + '%"></div>' +
        '<span class="fn-label">' + t('登记') + ' ' + regs.toLocaleString(locale) + '</span></div>' +
      '<div class="fn-row fn-cap"><div class="fn-bar" style="width:' + wCap + '%"></div>' +
        '<span class="fn-label">' + t('胶囊') + ' ' + caps.toLocaleString(locale) + '</span></div>' +
      '<div class="fn-target">' + targetText + ' ｜ ' + rateText + '</div>';
  }

  /* ---- 数据获取 ---- */
  var lastData = null;
  function loadAndRender() {
    fetch('/api/stats/public')
      .then(function (r) { return r.json(); })
      .then(function (data) { lastData = data; renderTree(data); })
      .catch(function () {});
  }

  /* ---- 语言切换时重新渲染（不重新拉数据，用缓存） ---- */
  window.addEventListener('i18n-lang-change', function () {
    if (lastData) renderTree(lastData);
  });

  /* ---- 滚动进入视口时启动 ---- */
  var started = false;
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting && !started) {
          started = true;
          loadAndRender();
          setInterval(loadAndRender, 10000);
        }
      });
    }, { rootMargin: '0px 0px -20% 0px' });
    var panel = document.getElementById('panel-tree');
    if (panel) io.observe(panel);
  } else {
    loadAndRender();
    setInterval(loadAndRender, 10000);
  }
})();
