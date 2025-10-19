const mongoose = require('mongoose');

async function connectToDatabase() {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        throw new Error('MONGODB_URI is not defined in the environment variables.');
    }
    await mongoose.connect(uri, {
        // Use Mongoose defaults; options kept minimal for v8+
    });
    console.log('Successfully connected to MongoDB via Mongoose');
}

module.exports = { connectToDatabase };