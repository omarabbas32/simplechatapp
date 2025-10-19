require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { connectToDatabase } = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const postRoutes = require('./routes/postRoutes');
const directMessageRoutes = require('./routes/directMessage');  
const groupRoutes = require('./routes/groupRoutes');
const messageRoutes = require('./routes/messageRoutes');
const authenticateToken = require('./middleware/auth');


const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/groups', authenticateToken, groupRoutes);
app.use('/api/messages', authenticateToken, messageRoutes);


app.use('/api/posts', postRoutes);
app.use('/api/direct-messages', directMessageRoutes);
app.set('io', io);

// map of userId -> Set of socketIds
const userSockets = new Map();

// socket auth middleware (expects token in socket.handshake.auth.token)
io.use((socket, next) => {
  try {
    const token = socket.handshake.auth && socket.handshake.auth.token;
    if (!token) return next(); // allow unauthenticated sockets if desired
    const jwt = require('jsonwebtoken');
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    socket.user = payload; // { _id, username, ... }
    return next();
  } catch (err) {
    // reject if you want to enforce auth: next(new Error('Authentication error'));
    return next();
  }
});

// Socket.io connection handling (upgraded)
io.on('connection', (socket) => {
  const uid = socket.user && socket.user._id ? String(socket.user._id) : null;
  console.log('Socket connected:', socket.id, uid ? `(user: ${uid})` : '');

  // register socket under user
  if (uid) {
    if (!userSockets.has(uid)) userSockets.set(uid, new Set());
    userSockets.get(uid).add(socket.id);
    // join a personal room for direct messages
    socket.join(`user_${uid}`);
  }

  // join group room
  socket.on('join_group', (groupId, cb) => {
    if (!groupId) return cb && cb({ ok: false, error: 'groupId required' });
    socket.join(`group_${groupId}`);
    cb && cb({ ok: true });
  });

  // leave group room
  socket.on('leave_group', (groupId, cb) => {
    if (!groupId) return cb && cb({ ok: false, error: 'groupId required' });
    socket.leave(`group_${groupId}`);
    cb && cb({ ok: true });
  });

  // typing indicator in group or direct (payload: { groupId?, toUserId?, isTyping: true/false })
  socket.on('typing', (payload) => {
    try {
      if (payload.groupId) {
        socket.to(`group_${payload.groupId}`).emit('typing', { from: uid, groupId: payload.groupId, isTyping: payload.isTyping });
      } else if (payload.toUserId) {
        io.to(`user_${payload.toUserId}`).emit('typing', { from: uid, to: payload.toUserId, isTyping: payload.isTyping });
      }
    } catch (e) { /* ignore */ }
  });

  // send direct message via socket (optional; controllers may persist and emit instead)
  // payload: { toUserId, content }
  socket.on('send_direct', async (payload, ack) => {
    if (!uid) return ack && ack({ ok: false, error: 'unauthenticated' });
    if (!payload || !payload.toUserId || !payload.content) return ack && ack({ ok: false, error: 'invalid payload' });

    const message = {
      sender: uid,
      receiver: payload.toUserId,
      content: payload.content,
      createdAt: new Date()
    };

    // emit to receiver(s) and sender
    io.to(`user_${payload.toUserId}`).emit('new_direct_message', message);
    socket.emit('new_direct_message', message);

    // ack with the message so client can optimistically render
    ack && ack({ ok: true, message });
  });

  // send group message via socket (optional; controllers may persist and emit instead)
  // payload: { groupId, content }
  socket.on('send_group', async (payload, ack) => {
    if (!uid) return ack && ack({ ok: false, error: 'unauthenticated' });
    if (!payload || !payload.groupId || !payload.content) return ack && ack({ ok: false, error: 'invalid payload' });

    const message = {
      sender: uid,
      groupId: payload.groupId,
      content: payload.content,
      createdAt: new Date()
    };

    // broadcast to group room (including sender)
    io.to(`group_${payload.groupId}`).emit('new_group_message', message);

    ack && ack({ ok: true, message });
  });

  // clean up on disconnect
  socket.on('disconnect', (reason) => {
    console.log('Socket disconnected:', socket.id, reason);
    if (uid && userSockets.has(uid)) {
      const set = userSockets.get(uid);
      set.delete(socket.id);
      if (set.size === 0) userSockets.delete(uid);
    }
  });

  // handle errors gracefully
  socket.on('error', (err) => {
    console.warn('Socket error', socket.id, err && err.message ? err.message : err);
  });
});


// Start server
const PORT = process.env.PORT || 3000;
connectToDatabase().then(() => {
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}).catch(err => {
  console.error('Failed to connect to the database:', err);
});