// File: /chat-application/chat-application/src/routes/groupRoutes.js

const express = require('express');
const router = express.Router();
const groupController = require('../controllers/groupController');
const authenticateToken = require('../middleware/auth');

// Get all groups for the authenticated user
router.get('/', authenticateToken, groupController.getUserGroups);

// Create a new group
router.post('/', authenticateToken, groupController.createGroup);

// Add a user to a group
router.post('/:id/add-user', authenticateToken, groupController.addUserToGroup);

// Get messages for a specific group
router.get('/:id/messages', authenticateToken, groupController.getGroupMessages);

// Send a message to a specific group
router.post('/:id/messages', authenticateToken, groupController.sendMessage);

module.exports = router;