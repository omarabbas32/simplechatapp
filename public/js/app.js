// Controls UI, talks to backend endpoints and Socket.IO if available
(async function(){
  const token = localStorage.getItem('token');
  const userLabel = document.getElementById('userLabel');
  const logoutBtn = document.getElementById('logoutBtn');
  const content = document.getElementById('content');
  const authBox = document.getElementById('authBox');
  const postsView = document.getElementById('postsView');
  const messagesView = document.getElementById('messagesView');
  const tabPosts = document.getElementById('tab-posts');
  const tabMessages = document.getElementById('tab-messages');

  function showView(view){
    document.querySelectorAll('.view').forEach(v=>v.classList.add('hidden'));
    view.classList.remove('hidden');
    document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
    if (view===postsView) tabPosts.classList.add('active'); else tabMessages.classList.add('active');
  }

  tabPosts.onclick = ()=>showView(postsView);
  tabMessages.onclick = ()=>showView(messagesView);

  if (!token) {
    // show login/register area (auth.js created it)
    content.classList.add('hidden');
    return;
  }

  // show main UI
  content.classList.remove('hidden');
  if (authBox) authBox.remove();

  logoutBtn.onclick = ()=>{
    localStorage.removeItem('token');
    window.location.reload();
  };

  // try to decode simple payload to show username (token format: jwt)
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    userLabel.textContent = payload.username || '';
  } catch {}

  // basic fetch wrapper
  async function api(path, opts={}) {
    opts.headers = opts.headers || {};
    opts.headers.Authorization = 'Bearer ' + token;
    if (opts.body && typeof opts.body === 'object') {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(opts.body);
    }
    const res = await fetch(path, opts);
    if (res.status === 401) { localStorage.removeItem('token'); location.reload(); }
    return res;
  }

  /* POSTS */
  async function loadPosts(){
    postsView.innerHTML = `
      <div class="post-form">
        <textarea id="postInput" placeholder="Share something..."></textarea>
        <div style="display:flex;justify-content:flex-end;margin-top:8px">
          <button class="btn" id="postCreateBtn">Post</button>
        </div>
      </div>
      <div id="postsList" style="margin-top:12px"></div>
    `;
    document.getElementById('postCreateBtn').onclick = createPost;
    await refreshPosts();
  }

  async function refreshPosts(){
    const list = document.getElementById('postsList');
    list.innerHTML = 'Loading...';
    try {
      const res = await api('/api/posts');
      const posts = await res.json();
      list.innerHTML = posts.map(renderPost).join('') || '<div>No posts yet</div>';
      // attach event listeners (delegation)
      list.querySelectorAll('[data-like]').forEach(btn=>{
        btn.onclick = async ()=> {
          await api(`/api/posts/${btn.dataset.like}/like`, { method:'POST' });
          refreshPosts();
        };
      });
      list.querySelectorAll('[data-comment-btn]').forEach(btn=>{
        btn.onclick = async ()=>{
          const id = btn.dataset.commentBtn;
          const inp = document.getElementById('comment-'+id);
          const v = inp.value.trim(); if(!v) return;
          await api(`/api/posts/${id}/comments`, { method:'POST', body:{ content: v } });
          inp.value=''; refreshPosts();
        };
      });
    } catch (e) { list.innerHTML = 'Failed to load posts'; console.error(e) }
  }

  function renderPost(p){
    const author = (p.author && p.author.username) ? escapeHtml(p.author.username) : 'user';
    const comments = (p.comments||[]).map(c=>{
      const name = (c.user && c.user.username) ? escapeHtml(c.user.username) : 'user';
      return `<div class="comment"><strong>${name}:</strong> ${escapeHtml(c.content)}</div>`;
    }).join('');
    return `
      <article class="post">
        <div class="meta"><div>${author}</div><div>${new Date(p.createdAt).toLocaleString()}</div></div>
        <div>${escapeHtml(p.content)}</div>
        <div class="actions">
          <button class="action-btn" data-like="${p._id}">❤️ ${p.likes?.length||0}</button>
          <button class="action-btn">💬 ${p.comments?.length||0}</button>
        </div>
        <div class="comments">${comments}
          <div class="input-inline">
            <input id="comment-${p._id}" placeholder="Write a comment..." />
            <button class="btn" data-comment-btn="${p._id}">Send</button>
          </div>
        </div>
      </article>
    `;
  }

  async function createPost(){
    const val = document.getElementById('postInput').value.trim();
    if (!val) return;
    await api('/api/posts', { method:'POST', body:{ content: val } });
    document.getElementById('postInput').value = '';
    refreshPosts();
  }

  /* MESSAGES (direct simple) */
  async function loadMessages(){
    messagesView.innerHTML = `
      <div style="display:flex;gap:12px">
        <div style="width:260px">
          <input id="dmUser" placeholder="Other user id" />
          <button class="btn" id="openConv">Open</button>
          <div style="margin-top:12px;color:var(--muted)">Tip: open a conversation by other user's id</div>
        </div>
        <div style="flex:1">
          <div id="convArea" class="message-list"></div>
          <div class="input-inline">
            <input id="dmInput" placeholder="Message..." />
            <button class="btn" id="dmSend">Send</button>
          </div>
        </div>
      </div>
    `;
    document.getElementById('openConv').onclick = openConv;
    document.getElementById('dmSend').onclick = sendDirect;
  }

  let currentOther = null;
  async function openConv(){
    const other = document.getElementById('dmUser').value.trim();
    if (!other) return;
    currentOther = other;
    const area = document.getElementById('convArea');
    area.innerHTML = 'Loading...';
    try {
      const res = await api(`/api/messages/direct/${other}`);
      const msgs = await res.json();
      area.innerHTML = msgs.map(m => `<div class="message"><strong>${m.sender === m.receiver ? 'you' : (m.sender === other ? 'them':'you') }</strong>: ${escapeHtml(m.content)}</div>`).join('');
    } catch (e) { area.innerHTML = 'Failed to load' }
  }

  async function sendDirect(){
    const txt = document.getElementById('dmInput').value.trim();
    if (!txt || !currentOther) return;
    await api('/api/messages/direct/send', { method:'POST', body:{ receiverId: currentOther, content: txt } });
    document.getElementById('dmInput').value='';
    openConv();
  }

  /* small helpers */
  function escapeHtml(s){ return String(s||'').replace(/[&<>"]/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }

  // initialize views
  await loadPosts();
  await loadMessages();
  showView(postsView);

  // optional: connect to socket.io if available for realtime updates
  try {
    if (window.io) {
      const socket = io(); // default connects to same host
      socket.on('connect', ()=> console.log('socket connected'));
      socket.on('new_post', (p)=> {
        // prepend new post if present
        refreshPosts();
      });
      socket.on('new_direct_message', (m)=> {
        // if current conversation matches, reload
        if (m.sender === currentOther || m.receiver === currentOther) openConv();
      });
    }
  } catch (e) { /* ignore */ }

})();