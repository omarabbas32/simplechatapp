// messageController.js

const Message = require('../models/Message');

// Get messages for a specific group
exports.getMessages = async (req, res) => {
    try {
        const groupId = req.params.id;
        const messages = await Message.find({ groupId }).sort({ created_at: 1 });
        res.status(200).json(messages);
    } catch (error) {
        console.error('Get messages error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Send a message to a specific group
exports.sendMessage = async (req, res) => {
    try {
        const groupId = req.params.id;
        const { message } = req.body;
        const userId = req.user._id;
        const username = req.user.username;

        const newMessage = new Message({
            groupId,
            sender: username,
            senderId: userId,
            message,
            created_at: new Date()
        });

        await newMessage.save();
        res.status(201).json({ message: 'Message sent successfully', newMessage });
    } catch (error) {
        console.error('Send message error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};