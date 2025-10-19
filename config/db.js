const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI;

let db;

async function connectToDatabase() {
    if (!MONGODB_URI) {
        throw new Error('MONGODB_URI is not defined in the environment variables.');
    }
    const client = new MongoClient(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
    await client.connect();
    db = client.db();
    console.log('Successfully connected to MongoDB');
}

function getDb() {
    if (!db) {
        throw new Error('Database not initialized. Call connectToDatabase first.');
    }
    return db;
}

module.exports = { connectToDatabase, getDb };