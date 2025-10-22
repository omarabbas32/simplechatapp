// Improved DM & Group frontend (uses auth.js token helpers)
// Assumes auth.js exposes getToken(), apiFetch() or uses localStorage token

(() => {
  const token = localStorage.getItem('token');
  if (!token) { document.getElementById('emptyState').textContent = 'Please login to use chat'; return; }

  const userLabel = document.getElementById('userLabel');
  const logoutBtn = document.getElementById('logoutBtn');
  const dmList = document.getElementById('dmList');
  const groupList = document.getElementById('groupList');
  const createGroupBtn = document.getElementById('createGroupBtn');
  const newGroupName = document.getElementById('newGroupName');

  const emptyState = document.getElementById('emptyState');
  const chatPanel = document.getElementById('chatPanel');
  const chatTitle = document.getElementById('chatTitle');
  const chatSub = document.getElementById('chatSub');
  const messagesEl = document.getElementById('messages');
  const messageInput = document.getElementById('messageInput');
  const sendBtn = document.getElementById('sendBtn');
  const typingIndicator = document.getElementById('typingIndicator');

  const API = path => fetch(path, {
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }
  });

  function decodeUsernameFromToken() {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.username || payload.name || payload._id;
    } catch { return null; }
  }
  userLabel.textContent = decodeUsernameFromToken() || 'You';
  logoutBtn.onclick = () => { localStorage.removeItem('token'); location.reload(); };

  // Socket.IO
  const socket = io({ auth: { token } });
  socket.on('connect', () => console.log('socket connected', socket.id));
  socket.on('connect_error', e => console.warn('socket connect error', e && e.message));

  // App state
  let current = null; // { type: 'dm'|'group', id, title }
  let typingTimeout = null;

  // Helpers
  const escapeHtml = s => String(s||'').replace(/[&<>"]/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));

  // Load lists
  async function loadDMs() {
    // server should provide endpoint to list recent DMs or users — fallback: show recent receivers from server or manual entry
    try {
      const res = await API('/api/users'); // if you don't have this, fallback to empty
      if (!res.ok) throw new Error('no users api');
      const users = await res.json();
      renderDMList(users.filter(u => u._id)); // show all users except self ideally
    } catch (e) {
      // fallback: allow user to open DM by id using input (existing UI also supports this)
      dmList.innerHTML = `<div class="muted">No user list available. Use DM by entering user id in search (top).</div>`;
    }
  }

  async function loadGroups() {
    try {
      const res = await API('/api/groups');
      if (!res.ok) throw new Error('failed');
      const groups = await res.json();
      renderGroupList(groups);
    } catch (e) {
      groupList.innerHTML = `<div class="muted">No groups yet</div>`;
    }
  }

  // Render lists
  function renderDMList(users) {
    dmList.innerHTML = users.map(u => `
      <div class="list-item" data-id="${u._id}" data-type="dm">
        <div><strong>${escapeHtml(u.username || u._id)}</strong></div>
      </div>
    `).join('');
    dmList.querySelectorAll('.list-item').forEach(el => el.onclick = () => openDM(el.dataset.id, el));
  }

  function renderGroupList(groups) {
    groupList.innerHTML = groups.map(g => `
      <div class="list-item" data-id="${g._id}" data-type="group">
        <div><strong>${escapeHtml(g.name)}</strong></div>
        <div class="muted small">${g.memberIds?.length || 0}</div>
      </div>
    `).join('');
    groupList.querySelectorAll('.list-item').forEach(el => el.onclick = () => openGroup(el.dataset.id, el));
  }

  // Open conversations
  async function openDM(otherId, el) {
    setActiveListItem(el);
    current = { type: 'dm', id: otherId, title: 'Direct' };
    chatTitle.textContent = `DM: ${otherId}`;
    chatSub.textContent = '';
    emptyState.classList.add('hidden');
    chatPanel.classList.remove('hidden');
    await loadMessagesForCurrent();
    socket.emit('join_dm', { toUserId: otherId }); // optional
  }

  async function openGroup(groupId, el) {
    setActiveListItem(el);
    current = { type: 'group', id: groupId, title: 'Group' };
    chatTitle.textContent = `Group: ${groupId}`;
    chatSub.textContent = '';
    emptyState.classList.add('hidden');
    chatPanel.classList.remove('hidden');
    socket.emit('join_group', groupId, () => {});
    await loadMessagesForCurrent();
  }

  function setActiveListItem(el) {
    document.querySelectorAll('.list-item').forEach(i => i.classList.remove('active'));
    if (el) el.classList.add('active');
  }

  // Load messages
  async function loadMessagesForCurrent() {
    messagesEl.innerHTML = '<div class="muted">Loading messages…</div>';
    try {
      if (!current) return;
      if (current.type === 'group') {
        const res = await API(`/api/groups/${current.id}/messages`);
        const data = await res.json();
        renderMessages(data);
      } else {
        const res = await API(`/api/messages/direct/${current.id}`);
        const data = await res.json();
        renderMessages(data);
      }
      scrollToBottom();
    } catch (e) {
      messagesEl.innerHTML = '<div class="muted">Failed to load messages</div>';
    }
  }

  function renderMessages(items) {
    if (!Array.isArray(items)) items = [];
    messagesEl.innerHTML = items.map(m => renderMessageHtml(m, m.sender === (decodeIdFromToken()) )).join('');
  }

  function renderMessageHtml(m, isMe) {
    const who = escapeHtml(m.sender?.username || m.sender || 'user');
    const time = new Date(m.createdAt || m.createdAt || Date.now()).toLocaleTimeString();
    const clsRow = isMe ? 'message-row me' : 'message-row';
    const clsBubble = isMe ? 'bubble me' : 'bubble';
    return `
      <div class="${clsRow}">
        <div class="${clsBubble}">${escapeHtml(m.content)}</div>
        <div class="meta">${who} · ${time}</div>
      </div>
    `;
  }

  function decodeIdFromToken() {
    try {
      const p = JSON.parse(atob(token.split('.')[1]));
      return p._id || p.id || null;
    } catch { return null; }
  }

  function scrollToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  // Sending
  sendBtn.onclick = sendMessage;
  messageInput.addEventListener('input', () => {
    if (!current) return;
    socket.emit('typing', current.type === 'group' ? { groupId: current.id, isTyping: true } : { toUserId: current.id, isTyping: true });
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => socket.emit('typing', current.type === 'group' ? { groupId: current.id, isTyping: false } : { toUserId: current.id, isTyping: false }), 1200);
  });

  async function sendMessage() {
    const txt = messageInput.value.trim();
    if (!txt || !current) return;
    messageInput.value = '';
    // Optimistic UI
    const temp = { sender: decodeIdFromToken(), content: txt, createdAt: new Date().toISOString() };
    messagesEl.insertAdjacentHTML('beforeend', renderMessageHtml(temp, true));
    scrollToBottom();

    try {
      if (current.type === 'group') {
        // prefer REST API to persist
        await fetch(`/api/groups/${current.id}/messages`, {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: txt })
        });
        // server should emit new_group_message -> handled below
      } else {
        await fetch('/api/messages/direct/send', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
          body: JSON.stringify({ receiverId: current.id, content: txt })
        });
      }
    } catch (e) {
      console.error('send failed', e);
    }
  }

  // Typing and message realtime handlers
  socket.on('typing', (payload) => {
    if (!current) return;
    if (current.type === 'group' && payload.groupId === current.id) {
      typingIndicator.textContent = payload.isTyping ? `${payload.fromName||payload.from} is typing…` : '';
    } else if (current.type === 'dm' && ((payload.from === current.id) || (payload.to === current.id))) {
      typingIndicator.textContent = payload.isTyping ? `${payload.fromName||payload.from} is typing…` : '';
    }
  });

  socket.on('new_group_message', (m) => {
    if (current && current.type === 'group' && m.groupId === current.id) {
      messagesEl.insertAdjacentHTML('beforeend', renderMessageHtml(m, m.sender === decodeIdFromToken()));
      scrollToBottom();
    }
    // Optionally refresh group list last message preview
  });

  socket.on('new_direct_message', (m) => {
    // m: { sender, receiver, content, createdAt }
    if (current && current.type === 'dm' && (m.sender === current.id || m.receiver === current.id)) {
      messagesEl.insertAdjacentHTML('beforeend', renderMessageHtml(m, m.sender === decodeIdFromToken()));
      scrollToBottom();
    }
    // Optionally mark conversation as unread in DM list
  });

  // Create group
  createGroupBtn.onclick = async () => {
    const name = newGroupName.value.trim();
    if (!name) return;
    try {
      const res = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      if (res.ok) {
        newGroupName.value = '';
        loadGroups();
      }
    } catch (e) { console.error(e) }
  };

  // initial load
  loadDMs(); loadGroups();

  // expose small helper for manual DM opening (if no users list)
  window.openDMById = (id) => openDM(id);

})();