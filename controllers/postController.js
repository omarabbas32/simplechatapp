const Post = require('../models/Post');

exports.createPost = async (req, res) => {
    try {
        const post = await Post.create({
            author: req.user._id,
            content: req.body.content
        });
        res.status(201).json(post);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.getAllPosts = async (req, res) => {
    try {
        const DirectMessage = require('../models/DirectMessage');
        const currentUserId = req.user._id;

        // Find distinct partner userIds from DMs (either side) and include self
        const sentTo = await DirectMessage.distinct('receiver', { sender: currentUserId });
        const receivedFrom = await DirectMessage.distinct('sender', { receiver: currentUserId });
        const partnerIdSet = new Set([String(currentUserId), ...sentTo.map(String), ...receivedFrom.map(String)]);
        const partnerIds = Array.from(partnerIdSet);

        const posts = await Post.find({ author: { $in: partnerIds } })
            .populate('author', 'username')
            .sort({ createdAt: -1 });
        res.json(posts);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.updatePost = async (req, res) => {
    try {
        const post = await Post.findOneAndUpdate(
            { _id: req.params.id, author: req.user._id },
            { content: req.body.content },
            { new: true }
        );
        if (!post) return res.status(404).json({ message: 'Post not found' });
        res.json(post);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.deletePost = async (req, res) => {
    try {
        const post = await Post.findOneAndDelete({
            _id: req.params.id,
            author: req.user._id
        });
        if (!post) return res.status(404).json({ message: 'Post not found' });
        res.json({ message: 'Post deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};