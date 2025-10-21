const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/auth');
const directMessageController = require('../controllers/directMessageController');

router.get('/conversations', authenticateToken, directMessageController.getConversations);
router.post('/send', authenticateToken, directMessageController.sendMessage);
router.get('/:userId', authenticateToken, directMessageController.getMessages);

module.exports = router;