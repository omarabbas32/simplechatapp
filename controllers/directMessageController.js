
const DirectMessage = require('../models/DirectMessage');

exports.sendMessage = async (req, res) => {
    try {
        const { receiverId, username, content } = req.body;
        let toId = receiverId;
        if (!toId && username) {
            const User = require('../models/User');
            const u = await User.findOne({ username: String(username).toLowerCase().trim() }).select('_id');
            if (u) toId = u._id;
        }
        if (!toId) return res.status(400).json({ message: 'receiverId or username required' });
        const message = await DirectMessage.create({ sender: req.user._id, receiver: toId, content });
        res.status(201).json(message);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.getMessages = async (req, res) => {
    try {
        const otherIdOrName = req.params.userId;
        const User = require('../models/User');
        let otherId = otherIdOrName;
        if (otherIdOrName && !otherIdOrName.match(/^[0-9a-fA-F]{24}$/)) {
            const u = await User.findOne({ username: String(otherIdOrName).toLowerCase().trim() }).select('_id');
            if (u) otherId = String(u._id);
        }
        const messages = await DirectMessage.find({
            $or: [
                { sender: req.user._id, receiver: otherId },
                { sender: otherId, receiver: req.user._id }
            ]
        }).sort({ createdAt: 1 });
        res.json(messages);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.getConversations = async (req, res) => {
    try {
        const User = require('../models/User');
        
        // Get all unique users that the current user has DMed with
        const conversations = await DirectMessage.aggregate([
            {
                $match: {
                    $or: [
                        { sender: req.user._id },
                        { receiver: req.user._id }
                    ]
                }
            },
            {
                $group: {
                    _id: {
                        $cond: [
                            { $eq: ["$sender", req.user._id] },
                            "$receiver",
                            "$sender"
                        ]
                    },
                    lastMessage: { $last: "$content" },
                    lastMessageTime: { $last: "$createdAt" },
                    unreadCount: {
                        $sum: {
                            $cond: [
                                { $and: [
                                    { $ne: ["$sender", req.user._id] },
                                    { $ne: ["$read", true] }
                                ]},
                                1,
                                0
                            ]
                        }
                    }
                }
            },
            {
                $lookup: {
                    from: "users",
                    localField: "_id",
                    foreignField: "_id",
                    as: "user"
                }
            },
            {
                $unwind: "$user"
            },
            {
                $project: {
                    _id: 1,
                    username: "$user.username",
                    lastMessage: 1,
                    lastMessageTime: 1,
                    unreadCount: 1
                }
            },
            {
                $sort: { lastMessageTime: -1 }
            }
        ]);
        
        res.json(conversations);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};