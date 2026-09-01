const { WebSocketServer } = require('ws');
const crypto = require('crypto');
const { WS_PORT, SECRET_KEY } = require('./config');
const { insertMessage } = require('./db');

const aesKey = crypto.createHash('sha256').update(SECRET_KEY).digest();
let activeClient = null;

function decrypt(encText) {
    const [ivHex, cipherHex] = encText.split(':');
    const decipher = crypto.createDecipheriv('aes-256-cbc', aesKey, Buffer.from(ivHex, 'hex'));
    let decrypted = decipher.update(cipherHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

function encrypt(text) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', aesKey, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
}

function startWSServer() {
    const wss = new WebSocketServer({ port: WS_PORT });
    console.log(`🔒 Secure WebSocket Server listening on port ${WS_PORT}`);

    wss.on('connection', (ws) => {
        console.log('⚡ Extension connected. Awaiting authentication...');
        let authenticated = false;

        ws.on('message', (messageBuffer) => {
            const rawMsg = messageBuffer.toString();
            
            // Step 1: Handshake
            if (!authenticated) {
                if (rawMsg === SECRET_KEY) {
                    authenticated = true;
                    activeClient = ws;
                    console.log('✅ Extension Authenticated Successfully!');
                    ws.send(encrypt(JSON.stringify({ type: 'auth_success' })));
                } else {
                    console.log('❌ Auth failed. Dropping connection.');
                    ws.close();
                }
                return;
            }

            // Step 2: Handle Encrypted Payloads
            try {
                const decryptedStr = decrypt(rawMsg);
                const payload = JSON.parse(decryptedStr);
                
                if (payload.type === 'new_message') {
                    const msg = payload.data;
                    console.log(`💬 New Message from ${msg.sender}: ${msg.text_content}`);
                    insertMessage.run(msg);
                }
            } catch (err) {
                console.error('⚠️ Failed to decrypt/parse payload:', err.message);
            }
        });

        ws.on('close', () => {
            console.log('🔌 Extension disconnected.');
            if (activeClient === ws) activeClient = null;
        });
    });
}

function sendToExtension(commandPayload) {
    if (!activeClient) throw new Error('Chrome Extension is not currently connected.');
    const encryptedCmd = encrypt(JSON.stringify(commandPayload));
    activeClient.send(encryptedCmd);
}

module.exports = { startWSServer, sendToExtension };
