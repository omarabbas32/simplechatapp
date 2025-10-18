// --- Dependencies ---
require('dotenv').config();
const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

// --- Initializations ---
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// --- Middleware ---
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// --- Environment Variables ---
let db;
const MONGODB_URI = process.env.MONGODB_URI;
const JWT_SECRET = process.env.JWT_SECRET;

// --- Database Connection ---
async function connectToDatabase() {
  if (!MONGODB_URI || !JWT_SECRET) {
    console.error('FATAL ERROR: MONGODB_URI or JWT_SECRET is not defined in the environment.');
    process.exit(1);
  }
  try {
    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db();
    console.log('Successfully connected to MongoDB');
    
    // Create collections and indexes
    await db.collection('users').createIndex({ username: 1 }, { unique: true });
    await db.collection('groups').createIndex({ name: 1 });
    await db.collection('messages').createIndex({ groupId: 1, created_at: 1 });
    
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
}

// --- Auth Middleware ---
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ message: 'Access token required' });
  }
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: 'Invalid or expired token' });
    req.user = user; // user contains { userId, username }
    next();
  });
};

// --- API Routes ---

// Register/Login
app.post('/api/auth', async (req, res) => {
  const { username, password, action } = req.body;
  try {
    if (action === 'register') {
      const existingUser = await db.collection('users').findOne({ username });
      if (existingUser) {
        return res.status(409).json({ message: 'Username already exists' });
      }
      const hashedPassword = await bcrypt.hash(password, 10);
      const result = await db.collection('users').insertOne({
        username,
        password: hashedPassword,
        created_at: new Date()
      });
      const token = jwt.sign({ userId: result.insertedId, username }, JWT_SECRET, { expiresIn: '24h' });
      return res.status(201).json({ token, username });
    } else {
      const user = await db.collection('users').findOne({ username });
      if (!user || !await bcrypt.compare(password, user.password)) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }
      const token = jwt.sign({ userId: user._id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });
      return res.status(200).json({ token, username });
    }
  } catch (error) {
    console.error('Auth error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get user's groups
app.get('/api/groups', authenticateToken, async (req, res) => {
  try {
    const userId = new ObjectId(req.user.userId);
    const groups = await db.collection('groups').find({
      member_ids: userId
    }).sort({ created_at: -1 }).toArray();
    
    // Add member count to each group
    groups.forEach(group => {
        group.member_count = group.member_ids.length;
    });

    res.json(groups);
  } catch (error) {
    console.error('Get groups error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create group
app.post('/api/groups', authenticateToken, async (req, res) => {
  try {
    const { name } = req.body;
    const creatorId = new ObjectId(req.user.userId);

    const result = await db.collection('groups').insertOne({
      name,
      created_by: creatorId,
      created_at: new Date(),
      member_ids: [creatorId] // Creator is the first member
    });
    
    const newGroup = await db.collection('groups').findOne({_id: result.insertedId});
    newGroup.member_count = 1;

    res.status(201).json(newGroup);
  } catch (error) {
    console.error('Create group error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Add user to group
app.post('/api/groups/:id/add-user', authenticateToken, async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ message: 'Invalid group ID format.' });
    }
    const groupId = new ObjectId(req.params.id);
    const { username } = req.body;
    const currentUserId = new ObjectId(req.user.userId);

    const group = await db.collection('groups').findOne({ _id: groupId });
    if (!group) {
        return res.status(404).json({ message: 'Group not found.' });
    }
    
    // Check if current user is in the group
    if (!group.member_ids.some(id => id.equals(currentUserId))) {
        return res.status(403).json({ message: 'You are not a member of this group.' });
    }

    const userToAdd = await db.collection('users').findOne({ username });
    if (!userToAdd) {
      return res.status(404).json({ message: 'User to add does not exist.' });
    }

    // Check if user is already in the group
    if (group.member_ids.some(id => id.equals(userToAdd._id))) {
        return res.status(409).json({ message: 'User is already in the group.' });
    }

    await db.collection('groups').updateOne(
      { _id: groupId },
      { $addToSet: { member_ids: userToAdd._id } }
    );

    res.json({ message: 'User added to group successfully.' });
  } catch (error) {
    console.error('Add user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get group messages
app.get('/api/groups/:id/messages', authenticateToken, async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ message: 'Invalid group ID format.' });
    }
    const groupId = new ObjectId(req.params.id);
    const userId = new ObjectId(req.user.userId);

    const group = await db.collection('groups').findOne({ _id: groupId });

    // Check if user is a member
    if (!group || !group.member_ids.some(id => id.equals(userId))) {
      return res.status(403).json({ message: 'You are not a member of this group.' });
    }

    const messages = await db.collection('messages').find({
      groupId: groupId
    }).sort({ created_at: 1 }).toArray();

    res.json(messages);
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Send message
app.post('/api/groups/:id/messages', authenticateToken, async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ message: 'Invalid group ID format.' });
    }
    const groupId = new ObjectId(req.params.id);
    const { message } = req.body;
    const userId = new ObjectId(req.user.userId);
    const username = req.user.username;
    
    const group = await db.collection('groups').findOne({ _id: groupId });

    // Check if user is a member
    if (!group || !group.member_ids.some(id => id.equals(userId))) {
      return res.status(403).json({ message: 'You are not a member of this group.' });
    }

    const messageDoc = {
      groupId: groupId,
      sender: username,
      senderId: userId,
      message: message,
      created_at: new Date()
    };

    const result = await db.collection('messages').insertOne(messageDoc);
    
    // Emit to all clients in the group
    io.to(`group_${groupId}`).emit('new_message', { ...messageDoc, _id: result.insertedId });

    res.status(201).json({ message: 'Message sent successfully' });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});


// --- Socket.io connection handling ---
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join_group', (groupId) => {
    socket.join(`group_${groupId}`);
    console.log(`User ${socket.id} joined group ${groupId}`);
  });

  socket.on('leave_group', (groupId) => {
    socket.leave(`group_${groupId}`);
    console.log(`User ${socket.id} left group ${groupId}`);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// --- Serve Frontend ---
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- Start Server ---
async function startServer() {
  await connectToDatabase();
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(``);
  });
}

startServer().catch(console.error);

