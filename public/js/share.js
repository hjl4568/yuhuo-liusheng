/* 通用分享组件：浮动按钮 + 分享卡片
 * 自动注入到白名单页面（落地页 / 应用首页），其他页面不显示。
 * 优先使用系统原生分享(navigator.share)，不支持时显示品牌分享卡片（可保存为图片 / 复制链接 / 平台分享）。
 */
(function () {
  'use strict';

  var ALLOW = ['/intro.html', '/app.html', '/', '/index.html', '/view.html'];
  var path = location.pathname;
  var ok = ALLOW.some(function (p) { return path === p || path.endsWith(p); });
  if (!ok) return;

  var TITLE = '长夜余火 · 余火留声';
  var DESC = '把话说出去，把物交还回去 —— 留给重要的人一份穿越时间的礼物。';

  function shareUrl() { return location.href; }
  function shortUrl() { var u = shareUrl(); return u.length > 46 ? u.slice(0, 43) + '…' : u; }
  function enc(s) { return encodeURIComponent(s); }

  function toast(msg) {
    var t = document.createElement('div');
    t.className = 'share-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.classList.add('show'); }, 10);
    setTimeout(function () { t.remove(); }, 2400);
  }

  function copyLink() {
    var url = shareUrl();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () {
        toast('链接已复制，去粘贴给 TA 吧');
      }, function () { fallbackCopy(url); });
    } else {
      fallbackCopy(url);
    }
  }
  function fallbackCopy(url) {
    var ta = document.createElement('textarea');
    ta.value = url; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); toast('链接已复制，去粘贴给 TA 吧'); }
    catch (e) { toast('复制失败，请手动复制网址'); }
    ta.remove();
  }

  function openWin(u) { window.open(u, '_blank', 'width=620,height=520'); }

  function doShare(act) {
    var url = shareUrl();
    if (act === 'copy') { copyLink(); return; }
    if (act === 'save') { drawShareCard(); return; }
    if (act === 'more' || act === 'wechat') {
      if (navigator.share) {
        navigator.share({ title: TITLE, text: DESC, url: url }).catch(function () {});
        return;
      }
      copyLink();
      if (act === 'wechat') toast('卡片已生成，链接也已复制，打开微信粘贴给好友');
      return;
    }
    if (act === 'qq') {
      openWin('https://connect.qq.com/widget/shareqq/index.html?url=' + enc(url) + '&title=' + enc(TITLE) + '&summary=' + enc(DESC));
      return;
    }
    if (act === 'weibo') {
      openWin('https://service.weibo.com/share/share.php?url=' + enc(url) + '&title=' + enc(TITLE + ' ' + DESC));
      return;
    }
    if (act === 'xhs') {
      copyLink();
      toast('链接已复制，打开小红书粘贴发布');
      return;
    }
  }

  // ===== 把品牌分享卡片画成 PNG，供保存/分享图片 =====
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function wrapText(ctx, text, cx, y, maxW, lh) {
    var chars = (text || '').split('');
    var line = '', yy = y;
    for (var i = 0; i < chars.length; i++) {
      var test = line + chars[i];
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, cx, yy); line = chars[i]; yy += lh;
      } else { line = test; }
    }
    if (line) ctx.fillText(line, cx, yy);
  }
  function drawShareCard() {
    try {
      var c = document.createElement('canvas');
      c.width = 600; c.height = 760;
      var x = c.getContext('2d');
      var g = x.createLinearGradient(0, 0, 0, 760);
      g.addColorStop(0, '#0c0f1a'); g.addColorStop(1, '#1c1306');
      x.fillStyle = g; x.fillRect(0, 0, 600, 760);
      var rg = x.createRadialGradient(300, 250, 10, 300, 250, 280);
      rg.addColorStop(0, 'rgba(240,179,90,0.30)'); rg.addColorStop(1, 'rgba(240,179,90,0)');
      x.fillStyle = rg; x.fillRect(0, 0, 600, 760);

      x.fillStyle = 'rgba(240,179,90,0.16)';
      x.beginPath(); x.arc(300, 180, 46, 0, Math.PI * 2); x.fill();
      x.strokeStyle = 'rgba(240,179,90,0.6)'; x.lineWidth = 2; x.stroke();
      x.fillStyle = '#f0b35a'; x.font = 'bold 44px serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText('余', 300, 182);

      x.fillStyle = '#f4ead2'; x.font = 'bold 40px serif';
      x.fillText('长夜余火', 300, 292);
      x.fillStyle = '#b3a78d'; x.font = '18px sans-serif';
      x.fillText('余火 · 留声', 300, 328);

      x.fillStyle = '#e8e2d4'; x.font = '22px sans-serif'; x.textBaseline = 'alphabetic';
      wrapText(x, '把话说出去，把物交还回去', 300, 394, 480, 32);
      x.fillStyle = '#c9bfa6'; x.font = '17px sans-serif';
      x.fillText('留给重要的人一份穿越时间的礼物', 300, 446);

      x.fillStyle = 'rgba(240,179,90,0.14)';
      roundRect(x, 70, 560, 460, 60, 14); x.fill();
      x.strokeStyle = 'rgba(240,179,90,0.4)'; x.lineWidth = 1;
      roundRect(x, 70, 560, 460, 60, 14); x.stroke();
      x.fillStyle = '#f0b35a'; x.font = '16px monospace';
      x.fillText(shortUrl(), 300, 596);

      x.fillStyle = '#857c6a'; x.font = '13px sans-serif';
      x.fillText('打开链接，了解这个把心意交还回去的项目', 300, 692);

      var a = document.createElement('a');
      a.download = '长夜余火-分享卡片.png';
      a.href = c.toDataURL('image/png');
      a.click();
      toast('卡片已生成，长按图片即可保存');
    } catch (e) {
      toast('生成卡片失败，请直接复制链接');
    }
  }

  function build() {
    var fab = document.createElement('button');
    fab.className = 'share-fab';
    fab.setAttribute('aria-label', '分享');
    fab.innerHTML = '<span class="share-fab-ico">🔗</span>';
    document.body.appendChild(fab);

    var mask = document.createElement('div');
    mask.className = 'share-mask';
    mask.innerHTML =
      '<div class="share-sheet">' +
        '<div class="share-sheet-title">分享长夜余火</div>' +
        '<div class="share-card">' +
          '<div class="sc-brand"><img class="sc-mark" src="/favicon.svg" alt="">长夜余火</div>' +
          '<div class="sc-tag">把话说出去，把物交还回去</div>' +
          '<div class="sc-sub">留给重要的人一份穿越时间的礼物</div>' +
          '<div class="sc-url" id="sc-url">' + shortUrl() + '</div>' +
        '</div>' +
        '<div class="share-grid">' +
          '<div class="share-item" data-act="save"><span class="si-ico">🖼️</span>保存卡片</div>' +
          '<div class="share-item" data-act="wechat"><span class="si-ico">💬</span>微信</div>' +
          '<div class="share-item" data-act="qq"><span class="si-ico">🐧</span>QQ</div>' +
          '<div class="share-item" data-act="weibo"><span class="si-ico">📰</span>微博</div>' +
          '<div class="share-item" data-act="xhs"><span class="si-ico">📕</span>小红书</div>' +
          '<div class="share-item" data-act="copy"><span class="si-ico">📋</span>复制链接</div>' +
        '</div>' +
        '<div class="share-sheet-tip">微信 / 小红书：点击「保存卡片」后去对应 App 发图，或用「复制链接」粘贴即可</div>' +
        '<button class="share-sheet-close" data-act="close">关闭</button>' +
      '</div>';
    document.body.appendChild(mask);

    fab.addEventListener('click', function () {
      var u = document.getElementById('sc-url');
      if (u) u.textContent = shortUrl();
      mask.classList.add('open');
    });
    mask.addEventListener('click', function (e) {
      if (e.target === mask) { mask.classList.remove('open'); return; }
      var item = e.target.closest('.share-item, .share-sheet-close');
      if (!item) return;
      var act = item.getAttribute('data-act');
      if (act === 'close') { mask.classList.remove('open'); return; }
      doShare(act);
      if (act !== 'wechat' && act !== 'qq' && act !== 'weibo' && act !== 'xhs' && act !== 'more' && act !== 'save') {
        mask.classList.remove('open');
      }
    });

    // 暴露给收件人页的“分享这封信”按钮（打开同一分享面板）
    window.__shareLetter = function () {
      if (navigator.share) {
        navigator.share({ title: TITLE, text: DESC, url: shareUrl() }).catch(function () {});
        return;
      }
      var u = document.getElementById('sc-url');
      if (u) u.textContent = shortUrl();
      mask.classList.add('open');
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else {
    build();
  }
})();
