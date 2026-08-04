/* 项目缘起页 · 点赞 / 评论 交互 */
(function () {
  'use strict';
  var SLUG = 'origin-story';
  var API = '/api/engagement/' + SLUG;
  function $(id) { return document.getElementById(id); }

  /* ---------- 点赞 ---------- */
  var likeBtn = $('likeBtn');
  var likeCount = $('likeCount');
  function setLiked(liked) {
    likeBtn.classList.toggle('liked', !!liked);
    likeBtn.setAttribute('aria-pressed', liked ? 'true' : 'false');
  }
  function loadLikes() {
    fetch(API).then(function (r) { return r.json(); }).then(function (d) {
      likeCount.textContent = d.likes || 0;
    }).catch(function () {});
  }
  likeBtn.addEventListener('click', function () {
    if (likeBtn.disabled) return;
    likeBtn.disabled = true;
    fetch(API + '/like', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        likeCount.textContent = d.likes || 0;
        setLiked(d.liked);
      })
      .catch(function () {})
      .finally(function () { likeBtn.disabled = false; });
  });

  /* ---------- 评论 ---------- */
  var form = $('commentForm');
  var nameEl = $('cmName');
  var contentEl = $('cmContent');
  var submitBtn = $('cmSubmit');
  var lenEl = $('cmLen');
  var listEl = $('comments-list');

  contentEl.addEventListener('input', function () { lenEl.textContent = contentEl.value.length; });

  function fmtTime(t) {
    if (!t) return '';
    return String(t).replace('T', ' ').slice(0, 16);
  }
  function render(comments) {
    listEl.textContent = '';
    if (!comments || !comments.length) {
      var e = document.createElement('div');
      e.className = 'cm-empty';
      e.textContent = '还没有留言，来写下第一条吧。';
      listEl.appendChild(e);
      return;
    }
    comments.forEach(function (c) {
      var item = document.createElement('div'); item.className = 'cm-item';
      var head = document.createElement('div'); head.className = 'cm-item-head';
      var nm = document.createElement('span'); nm.className = 'cm-name'; nm.textContent = c.nickname || '匿名旅人';
      var tm = document.createElement('span'); tm.className = 'cm-time'; tm.textContent = fmtTime(c.created_at);
      head.appendChild(nm); head.appendChild(tm);
      var body = document.createElement('p'); body.className = 'cm-body'; body.textContent = c.content;
      item.appendChild(head); item.appendChild(body);
      listEl.appendChild(item);
    });
  }
  function loadComments() {
    fetch(API + '/comments').then(function (r) { return r.json(); }).then(function (d) {
      render(d.comments || []);
    }).catch(function () { render([]); });
  }
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var content = contentEl.value.trim();
    if (!content) { alert('请先写点什么再发表～'); return; }
    submitBtn.disabled = true; submitBtn.textContent = '发表中…';
    fetch(API + '/comment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname: nameEl.value.trim(), content: content })
    }).then(function (r) {
      return r.json().then(function (d) { return { ok: r.ok, d: d }; });
    }).then(function (res) {
      if (res.ok && res.d.comment) {
        contentEl.value = ''; lenEl.textContent = '0';
        loadComments();
      } else {
        alert((res.d && res.d.error) || '发表失败，请稍后再试');
      }
    }).catch(function () { alert('网络异常，请稍后再试'); })
      .finally(function () { submitBtn.disabled = false; submitBtn.textContent = '发表留言'; });
  });

  loadLikes();
  loadComments();
})();
