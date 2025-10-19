class Group {
    constructor(name, createdBy) {
        this.name = name;
        this.createdBy = createdBy;        const mongoose = require('mongoose');
        
        const directMessageSchema = new mongoose.Schema({
            sender: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
                required: true
            },
            receiver: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
                required: true
            },
            content: {
                type: String,
                required: true
            },
            isRead: {
                type: Boolean,
                default: false
            }
        }, { timestamps: true });
        
        module.exports = mongoose.model('DirectMessage', directMessageSchema);
        this.createdAt = new Date();
        this.memberIds = [createdBy]; // Creator is the first member
    }

    addMember(userId) {
        if (!this.memberIds.includes(userId)) {
            this.memberIds.push(userId);
        }
    }

    removeMember(userId) {
        this.memberIds = this.memberIds.filter(id => id !== userId);
    }

    getMemberCount() {
        return this.memberIds.length;
    }
}

module.exports = Group;