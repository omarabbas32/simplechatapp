
const DirectMessage = require('../models/DirectMessage');

exports.sendMessage = async (req, res) => {
    try {
        const { receiverId, content } = req.body;
        const message = await DirectMessage.create({
            sender: req.user._id,
            receiver: receiverId,
            content
        });
        res.status(201).json(message);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.getMessages = async (req, res) => {
    try {
        const messages = await DirectMessage.find({
            $or: [
                { sender: req.user._id, receiver: req.params.userId },
                { sender: req.params.userId, receiver: req.user._id }
            ]
        }).sort({ createdAt: 1 });
        res.json(messages);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};