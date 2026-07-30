// ===== 余火·留声 — API 客户端 =====

const API_BASE = '/api';

function getToken() {
  return localStorage.getItem('token') || '';
}

function setToken(token) {
  localStorage.setItem('token', token);
}

function clearToken() {
  localStorage.removeItem('token');
}

function isLoggedIn() {
  return !!getToken();
}

async function request(url, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (getToken()) {
    headers['Authorization'] = `Bearer ${getToken()}`;
  }

  const res = await fetch(`${API_BASE}${url}`, { ...options, headers });

  if (res.status === 401) {
    clearToken();
    showToast('登录已过期，请重新登录');
    setTimeout(() => { window.location.href = '/login.html'; }, 1500);
    throw new Error('Unauthorized');
  }

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || '请求失败');
  }
  return data;
}

async function uploadFile(url, formData) {
  const headers = {};
  if (getToken()) {
    headers['Authorization'] = `Bearer ${getToken()}`;
  }
  const res = await fetch(`${API_BASE}${url}`, { method: 'POST', headers, body: formData });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '上传失败');
  return data;
}

// ===== Toast =====
function showToast(message, duration = 2500) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), duration);
}

// ===== 状态映射 =====
const STATUS_MAP = {
  saved: { text: '已保存', class: 'status-saved' },
  pending: { text: '等待触发', class: 'status-pending' },
  triggered: { text: '已触发', class: 'status-pending' },
  delivered: { text: '已送达', class: 'status-delivered' },
  failed: { text: '发送失败', class: 'status-failed' },
  cancelled: { text: '已取消', class: 'status-cancelled' },
};

const TYPE_MAP = {
  text: '文字',
  audio: '录音',
  video: '视频',
  image: '图片',
};

function statusTag(status) {
  const s = STATUS_MAP[status] || { text: status, class: 'status-saved' };
  return `<span class="status-tag ${s.class}">${s.text}</span>`;
}

function typeTag(type) {
  return `<span class="type-tag">${TYPE_MAP[type] || type}</span>`;
}

// ===== 跳转守护 =====
function requireAuth() {
  if (!isLoggedIn()) {
    window.location.href = '/login.html';
    return false;
  }
  return true;
}
