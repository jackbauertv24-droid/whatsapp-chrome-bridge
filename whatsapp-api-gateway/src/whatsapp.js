const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const axios = require('axios');
const fs = require('fs');
const { AUTH_DIR, WEBHOOK_URL, PAIRING_PHONE, LOG_LEVEL, LOG_FILE } = require('./config');
const db = require('./db');

let sock = null;
let connectionStatus = 'disconnected';

const stream = pino.destination(LOG_FILE);
const logger = pino({ level: LOG_LEVEL }, stream);

async function startWhatsApp() {
    console.log(`📝 Writing verbose logs to: ${LOG_FILE}`);
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    
    // Fetch latest web version to prevent 400 Bad Request rejections from WhatsApp servers
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`🌐 Using WA v${version.join('.')} (isLatest: ${isLatest})`);

    sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        logger,
        // Mimicking a standard Chrome browser on Ubuntu (often fixes 400 Bad Request for pairing codes)
        browser: ['Ubuntu', 'Chrome', '20.0.04']
    });

    sock.ev.on('creds.update', saveCreds);

    if (PAIRING_PHONE && !state.creds.registered) {
        connectionStatus = 'waiting_for_pairing_code';
        console.log(`\n⏳ Requesting pairing code for phone number: ${PAIRING_PHONE}...`);
        
        setTimeout(async () => {
            try {
                let code = await sock.requestPairingCode(PAIRING_PHONE);
                code = code?.match(/.{1,4}/g)?.join('-') || code;
                console.log(`\n========================================`);
                console.log(`🔑 PAIRING CODE: ${code}`);
                console.log(`========================================\n`);
            } catch (err) {
                console.error('❌ Failed to request pairing code:', err.message);
                logger.error({ err }, 'Failed to request pairing code');
            }
        }, 3000);
    }

    sock.ev.on('qr', (qr) => {
        if (!PAIRING_PHONE) {
            connectionStatus = 'waiting_for_scan';
            console.log('\n📱 Scan this QR code with WhatsApp:');
            qrcode.generate(qr, { small: true });
        }
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        
        console.log('📡 Connection Update:', JSON.stringify(update));
        logger.info({ update }, 'Connection Update');

        if (connection === 'close') {
            connectionStatus = 'disconnected';
            const shouldReconnect = (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut);
            console.log('🔌 Connection closed. Reconnecting?', shouldReconnect);
            if (shouldReconnect) setTimeout(startWhatsApp, 2000);
        } else if (connection === 'open') {
            connectionStatus = 'connected';
            console.log('✅ WhatsApp connected and listening to events!');
        }
    });

    // Ingest events
    sock.ev.on('contacts.upsert', (contacts) => {
        const tx = db.db.transaction((conts) => {
            for (const c of conts) {
                db.upsertContact.run({ jid: c.id, name: c.name || null, push_name: c.notify || null });
            }
        });
        tx(contacts);
    });

    sock.ev.on('chats.upsert', (chats) => {
        const tx = db.db.transaction((chts) => {
            for (const c of chts) {
                db.upsertChat.run({
                    jid: c.id,
                    name: c.name || null,
                    unread_count: c.unreadCount || 0,
                    updated_at: c.conversationTimestamp || Math.floor(Date.now() / 1000)
                });
            }
        });
        tx(chats);
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        const tx = db.db.transaction((msgs) => {
            for (const msg of msgs) {
                if (!msg.message) continue;
                const remoteJid = msg.key.remoteJid;
                const fromMe = msg.key.fromMe ? 1 : 0;
                const id = msg.key.id;
                const participant = msg.key.participant || null;
                const pushName = msg.pushName || null;
                
                const textContent = msg.message.conversation || msg.message.extendedTextMessage?.text || null;
                const timestamp = msg.messageTimestamp;

                db.db.prepare(`INSERT OR IGNORE INTO chats (jid, updated_at) VALUES (?, ?)`).run(remoteJid, timestamp);
                db.insertMessage.run({ id, remote_jid: remoteJid, from_me: fromMe, participant, push_name: pushName, text_content: textContent, timestamp });
            }
        });
        tx(messages);
    });
}

module.exports = { startWhatsApp, getSock: () => sock };
