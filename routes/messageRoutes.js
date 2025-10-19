// messageRoutes.js

const express = require('express');
const { sendMessage, getMessages } = require('../controllers/messageController');
const authenticateToken = require('../middleware/auth');

const router = express.Router();

// Route to send a message
router.post('/:id/messages', authenticateToken, sendMessage);

// Route to get messages for a group
router.get('/:id/messages', authenticateToken, getMessages);

module.exports = router;