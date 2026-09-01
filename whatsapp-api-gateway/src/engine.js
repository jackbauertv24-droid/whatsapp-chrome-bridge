const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const pino = require('pino');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const { DATA_DIR, MEDIA_DIR, WEBHOOK_URL, LOG_LEVEL, LOG_FILE } = require('./config');
const db = require('./db');

const stream = pino.destination(LOG_FILE);
const logger = pino({ level: LOG_LEVEL }, stream);

let connectionStatus = 'disconnected';

const client = new Client({
    // Store session locally so we don't need to re-scan QR codes
    authStrategy: new LocalAuth({ dataPath: path.join(DATA_DIR, 'session') }),
    puppeteer: {
        // Crucial for running headless in Linux containers
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        headless: true
    }
});

client.on('qr', (qr) => {
    connectionStatus = 'waiting_for_scan';
    console.log('\n📱 Scan this QR code with WhatsApp:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', async () => {
    connectionStatus = 'connected';
    console.log('✅ WhatsApp connected via whatsapp-web.js!');
    logger.info('WhatsApp connected successfully');

    // Bootstrap historical data if the database is relatively empty
    try {
        const chatCount = db.db.prepare('SELECT COUNT(*) as c FROM chats').get().c;
        if (chatCount < 5) {
            console.log('🔄 Bootstrapping chat history (this may take a moment)...');
            const chats = await client.getChats();
            
            // Limit to the top 20 active chats to avoid getting rate-limited on boot
            const topChats = chats.slice(0, 20);
            
            for (const chat of topChats) {
                // Upsert Chat
                db.upsertChat.run({
                    jid: chat.id._serialized,
                    name: chat.name || 'Unknown',
                    unread_count: chat.unreadCount || 0,
                    updated_at: chat.timestamp || Math.floor(Date.now() / 1000)
                });

                // Fetch recent messages
                const messages = await chat.fetchMessages({ limit: 50 });
                for (const msg of messages) {
                    processAndSaveMessage(msg, chat.id._serialized);
                }
            }
            console.log('✅ Bootstrap complete!');
        }
    } catch (err) {
        console.error('⚠️ Bootstrap failed (non-fatal):', err.message);
        logger.error({ err }, 'Bootstrap failed');
    }
});

client.on('auth_failure', msg => {
    console.error('❌ Authentication failed:', msg);
    logger.error({ msg }, 'Auth failure');
    connectionStatus = 'disconnected';
});

client.on('disconnected', (reason) => {
    console.log('🔌 Client was logged out or disconnected:', reason);
    logger.info({ reason }, 'Client disconnected');
    connectionStatus = 'disconnected';
});

// Main message ingestion pipeline
client.on('message_create', async (msg) => {
    const remoteJid = msg.fromMe ? msg.to : msg.from;
    processAndSaveMessage(msg, remoteJid);
});

async function processAndSaveMessage(msg, remoteJid) {
    try {
        let localMediaPath = null;
        
        // Handle Media Download safely
        if (msg.hasMedia) {
            try {
                const media = await msg.downloadMedia();
                if (media && media.data) {
                    // Extract extension from mimetype (e.g. image/jpeg -> jpeg)
                    const ext = media.mimetype.split('/')[1]?.split(';')[0] || 'bin';
                    const filename = `${msg.id.id}.${ext}`;
                    localMediaPath = path.join(MEDIA_DIR, filename);
                    fs.writeFileSync(localMediaPath, media.data, 'base64');
                    logger.debug(`Downloaded media: ${filename}`);
                }
            } catch (mediaErr) {
                logger.warn({ err: mediaErr.message }, 'Failed to download media for message');
            }
        }

        const replyToId = msg.hasQuotedMsg ? (await msg.getQuotedMessage())?.id?.id : null;
        
        // Ensure chat exists
        db.db.prepare('INSERT OR IGNORE INTO chats (jid, updated_at) VALUES (?, ?)').run(remoteJid, msg.timestamp);

        db.insertMessage.run({
            id: msg.id.id,
            remote_jid: remoteJid,
            from_me: msg.fromMe ? 1 : 0,
            participant: msg.author || null,
            push_name: msg._data?.notifyName || null,
            text_content: msg.body || null,
            local_media_path: localMediaPath,
            reply_to_id: replyToId,
            timestamp: msg.timestamp
        });

        // Fire Webhook for external apps (only on incoming)
        if (!msg.fromMe && WEBHOOK_URL) {
            axios.post(WEBHOOK_URL, {
                event: 'message.new',
                data: {
                    id: msg.id.id,
                    remoteJid,
                    textContent: msg.body,
                    hasMedia: !!localMediaPath,
                    timestamp: msg.timestamp
                }
            }).catch(() => {}); // Suppress webhook errors
        }

    } catch (err) {
        logger.error({ err, msgId: msg.id.id }, 'Failed to process message');
    }
}

async function startEngine() {
    console.log('🚀 Initializing whatsapp-web.js engine...');
    await client.initialize();
}

// Graceful shutdown function exposed to index.js
async function stopEngine() {
    console.log('🛑 Shutting down browser gracefully...');
    try {
        await client.destroy();
        console.log('✅ Browser closed.');
    } catch (err) {
        console.error('⚠️ Error closing browser:', err.message);
    }
}

module.exports = { 
    startEngine, 
    stopEngine,
    getClient: () => client,
    getStatus: () => connectionStatus
};
