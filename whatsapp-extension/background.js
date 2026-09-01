importScripts('crypto-js.min.js');

// 🚀 AUTO-CONFIGURED URLs FOR THIS SPECIFIC ENVIRONMENT
let API_URL = 'YOUR_API_URL_HERE';
let SECRET_KEY = 'YOUR_SECRET_KEY_HERE';
let AES_KEY = CryptoJS.SHA256(SECRET_KEY);

// Allow override via popup if needed in the future
function loadSettings() {
    chrome.storage.local.get(['API_URL', 'SECRET_KEY'], (data) => {
        if (data.API_URL && data.SECRET_KEY) {
            API_URL = data.API_URL;
            SECRET_KEY = data.SECRET_KEY;
            AES_KEY = CryptoJS.SHA256(SECRET_KEY);
        }
    });
}
loadSettings();
chrome.storage.onChanged.addListener(loadSettings);

function encrypt(text) {
    const iv = CryptoJS.lib.WordArray.random(16);
    const encrypted = CryptoJS.AES.encrypt(text, AES_KEY, { iv: iv, mode: CryptoJS.mode.CBC });
    return iv.toString(CryptoJS.enc.Hex) + ':' + encrypted.ciphertext.toString(CryptoJS.enc.Hex);
}

function decrypt(encText) {
    const parts = encText.split(':');
    const iv = CryptoJS.enc.Hex.parse(parts[0]);
    const ciphertext = CryptoJS.enc.Hex.parse(parts[1]);
    const cipherParams = CryptoJS.lib.CipherParams.create({ ciphertext: ciphertext });
    const decrypted = CryptoJS.AES.decrypt(cipherParams, AES_KEY, { iv: iv, mode: CryptoJS.mode.CBC });
    return decrypted.toString(CryptoJS.enc.Utf8);
}

// 1. PUSH MESSAGES TO SERVER
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'new_message') {
        const encryptedPayload = encrypt(JSON.stringify(request));
        fetch(`${API_URL}/api/webhook`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Authorization': `Bearer ${SECRET_KEY}`, 'Content-Type': 'text/plain' },
            body: encryptedPayload
        }).catch(err => console.error('Webhook failed:', err));
    }
});

// 2. POLL SERVER FOR COMMANDS
async function pollCommands() {
    try {
        const response = await fetch(`${API_URL}/api/commands`, {
            method: 'GET',
            credentials: 'include',
            headers: { 'Authorization': `Bearer ${SECRET_KEY}` }
        });
        if (response.ok) {
            const encryptedStr = await response.text();
            const decrypted = JSON.parse(decrypt(encryptedStr));
            if (decrypted.type === 'send_message') {
                chrome.tabs.query({url: "*://web.whatsapp.com/*"}, function(tabs) {
                    if (tabs.length > 0) chrome.tabs.sendMessage(tabs[0].id, decrypted);
                });
            }
        }
    } catch (err) { }
}

setInterval(pollCommands, 3000);
