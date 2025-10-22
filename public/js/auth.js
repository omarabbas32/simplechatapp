// lightweight auth UI + helpers used by app.js
const API_BASE = '';

function setToken(t){ localStorage.setItem('token', t) }
function getToken(){ return localStorage.getItem('token') }
function clearToken(){ localStorage.removeItem('token') }

async function apiFetch(path, opts = {}) {
  opts.headers = opts.headers || {};
  const token = getToken();
  if (token) opts.headers['Authorization'] = 'Bearer ' + token;
  if (opts.body && typeof opts.body === 'object' && !(opts.body instanceof FormData)) {
    opts.body = JSON.stringify(opts.body);
    opts.headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(API_BASE + path, opts);
  if (res.status === 401) { clearToken(); window.location.reload(); }
  return res;
}

function renderAuthBox(container) {
  container.innerHTML = `
    <h2>Welcome</h2>
    <div id="authTabs" class="row" style="margin:12px 0">
      <button id="showLogin" class="btn ghost">Login</button>
      <button id="showRegister" class="btn">Register</button>
    </div>
    <div id="authForm"></div>
  `;
  document.getElementById('showLogin').onclick = () => authForm('login');
  document.getElementById('showRegister').onclick = () => authForm('register');
  authForm('login');
}

function authForm(mode='login'){
  const f = document.getElementById('authForm');
  f.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:8px">
      <input id="u" placeholder="username" />
      <input id="p" placeholder="password" type="password" />
      <div class="row">
        <button id="submitAuth" class="btn">${mode==='login'?'Login':'Create'}</button>
      </div>
      <div id="authMsg" style="color:#f87171;margin-top:6px"></div>
    </div>
  `;
  document.getElementById('submitAuth').onclick = async () => {
    const u = document.getElementById('u').value.trim();
    const p = document.getElementById('p').value;
    if (!u || !p) return (document.getElementById('authMsg').textContent = 'Enter credentials');
    try {
      const path = mode==='login' ? '/api/auth/login' : '/api/auth/register';
      const res = await fetch(path, { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ username: u, password: p }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Auth failed');
      setToken(data.token);
      window.location.reload();
    } catch (err) {
      document.getElementById('authMsg').textContent = err.message || err;
    }
  };
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    const authBox = document.getElementById('authBox');
    const token = getToken();
    if (!token) { renderAuthBox(authBox); } else { authBox.remove(); }
  });
} else {
  const authBox = document.getElementById('authBox');
  const token = getToken();
  if (!token) { renderAuthBox(authBox); } else { authBox.remove(); }
}