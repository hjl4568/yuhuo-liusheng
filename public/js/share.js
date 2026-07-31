/* 通用分享组件：浮动按钮 + 分享面板
 * 自动注入到白名单页面（落地页 / 应用首页），其他页面不显示。
 * 优先使用系统原生分享(navigator.share)，不支持时显示自定义面板。
 */
(function () {
  'use strict';

  var ALLOW = ['/intro.html', '/app.html', '/', '/index.html'];
  var path = location.pathname;
  var ok = ALLOW.some(function (p) { return path === p || path.endsWith(p); });
  if (!ok) return;

  var TITLE = '长夜余火 · 余火留声';
  var DESC = '把话说出去，把物交还回去 —— 留给重要的人一份穿越时间的礼物。';

  function shareUrl() { return location.href; }
  function enc(s) { return encodeURIComponent(s); }

  function toast(msg) {
    var t = document.createElement('div');
    t.className = 'share-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.classList.add('show'); }, 10);
    setTimeout(function () { t.remove(); }, 2200);
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
    if (act === 'more' || act === 'wechat') {
      // 微信/H5 无法直接调起 App，引导复制后去微信粘贴
      if (navigator.share) {
        navigator.share({ title: TITLE, text: DESC, url: url }).catch(function () {});
        return;
      }
      copyLink();
      if (act === 'wechat') toast('链接已复制，请打开微信粘贴给好友');
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
      // 小红书无标准 web 分享，引导复制后去 App 发布
      copyLink();
      toast('链接已复制，打开小红书粘贴发布');
      return;
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
        '<div class="share-sheet-title">分享给 TA</div>' +
        '<div class="share-grid">' +
          '<div class="share-item" data-act="wechat"><span class="si-ico">💬</span>微信</div>' +
          '<div class="share-item" data-act="qq"><span class="si-ico">🐧</span>QQ</div>' +
          '<div class="share-item" data-act="weibo"><span class="si-ico">📰</span>微博</div>' +
          '<div class="share-item" data-act="xhs"><span class="si-ico">📕</span>小红书</div>' +
          '<div class="share-item" data-act="copy"><span class="si-ico">📋</span>复制链接</div>' +
          '<div class="share-item" data-act="more"><span class="si-ico">⋯</span>更多</div>' +
        '</div>' +
        '<div class="share-sheet-tip">微信 / 小红书：点击后复制链接，去对应 App 粘贴即可</div>' +
        '<button class="share-sheet-close" data-act="close">关闭</button>' +
      '</div>';
    document.body.appendChild(mask);

    fab.addEventListener('click', function () { mask.classList.add('open'); });
    mask.addEventListener('click', function (e) {
      if (e.target === mask) { mask.classList.remove('open'); return; }
      var item = e.target.closest('.share-item, .share-sheet-close');
      if (!item) return;
      var act = item.getAttribute('data-act');
      if (act === 'close') { mask.classList.remove('open'); return; }
      doShare(act);
      if (act !== 'wechat' && act !== 'qq' && act !== 'weibo' && act !== 'xhs' && act !== 'more') {
        mask.classList.remove('open');
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else {
    build();
  }
})();
