const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { PORT, SECRET_KEY } = require('./config');
const { db, insertMessage } = require('./db');

const app = express();

// Global middleware to strip double slashes
app.use((req, res, next) => {
    req.url = req.url.replace(/\/\/+/g, '/');
    next();
});

app.use(cors());
app.use(express.text()); 

const aesKey = crypto.createHash('sha256').update(SECRET_KEY).digest();
let outgoingCommandQueue = [];

function authGuard(req, res, next) {
    if (req.method === 'OPTIONS') return next();
    const authHeader = req.headers.authorization;
    console.log(`[AUTH] Received: "${authHeader}"`);
    if (!authHeader || authHeader !== `Bearer ${SECRET_KEY}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
}

function decrypt(encText) {
    try {
        const [ivHex, cipherHex] = encText.split(':');
        const decipher = crypto.createDecipheriv('aes-256-cbc', aesKey, Buffer.from(ivHex, 'hex'));
        let decrypted = decipher.update(cipherHex, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (e) {
        return null;
    }
}

function encrypt(text) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', aesKey, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
}

app.post('/api/webhook', authGuard, (req, res) => {
    const decryptedStr = decrypt(req.body);
    if (!decryptedStr) return res.status(400).json({ error: 'Decryption failed' });
    try {
        const payload = JSON.parse(decryptedStr);
        if (payload.type === 'new_message') {
            const msg = payload.data;
            console.log(`💬 New Message from ${msg.sender}: ${msg.text_content}`);
            insertMessage.run(msg);
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Database error' });
    }
});

app.get('/api/commands', authGuard, (req, res) => {
    if (outgoingCommandQueue.length > 0) {
        const command = outgoingCommandQueue.shift();
        res.send(encrypt(JSON.stringify(command)));
    } else {
        res.send(encrypt(JSON.stringify({ type: 'ping' })));
    }
});

app.get('/api/messages', (req, res) => {
    const messages = db.prepare('SELECT * FROM messages ORDER BY timestamp DESC LIMIT 50').all();
    res.json(messages);
});

app.post('/api/send', express.json(), (req, res) => {
    const { chat_id, text } = req.body;
    outgoingCommandQueue.push({ type: 'send_message', chat_id, text });
    res.json({ success: true, message: 'Command queued' });
});

function startAPIServer() {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`🌐 HTTP API Gateway listening on port ${PORT}`);
    });
}
module.exports = { startAPIServer };
