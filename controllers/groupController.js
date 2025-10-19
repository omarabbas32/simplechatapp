const Group = require('../models/Group');
const Message = require('../models/Message');

exports.getUserGroups = async (req, res) => {
    try {
        const groups = await Group.find({ members: req.user._id })
            .populate('createdBy', 'username')
            .populate('members', 'username')
            .sort({ createdAt: -1 });
        res.json(groups);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.createGroup = async (req, res) => {
    try {
        const { name } = req.body;
        if (!name) return res.status(400).json({ message: 'name required' });
        const group = await Group.create({ name, createdBy: req.user._id, members: [req.user._id] });
        res.status(201).json(group);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.addUserToGroup = async (req, res) => {
    try {
        const groupId = req.params.id;
        const { userId, username } = req.body;
        let memberId = userId;
        if (!memberId && username) {
            const User = require('../models/User');
            const u = await User.findOne({ username: String(username).toLowerCase().trim() }).select('_id');
            if (u) memberId = u._id;
        }
        if (!memberId) return res.status(400).json({ message: 'userId or username required' });
        const group = await Group.findByIdAndUpdate(
            groupId,
            { $addToSet: { members: memberId } },
            { new: true }
        ).populate('members', 'username');
        if (!group) return res.status(404).json({ message: 'Group not found' });
        res.json(group);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.getGroupMessages = async (req, res) => {
    try {
        const messages = await Message.find({ groupId: req.params.id }).sort({ created_at: 1 });
        res.json(messages);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.sendMessage = async (req, res) => {
    try {
        const { message } = req.body;
        if (!message) return res.status(400).json({ message: 'message required' });
        const doc = await Message.create({
            groupId: req.params.id,
            sender: req.user.username,
            senderId: req.user._id,
            message,
            created_at: new Date()
        });

        // emit to socket.io room for the group if available
        try {
            const io = req.app.get('io');
            if (io) io.to(`group_${req.params.id}`).emit('new_group_message', doc);
        } catch (_) {}

        res.status(201).json(doc);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};