require('dotenv').config();
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '../data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

module.exports = {
    PORT: process.env.PORT || 3000,
    WS_PORT: process.env.WS_PORT || 8080,
    DB_PATH: path.join(DATA_DIR, 'whatsapp.db'),
    SECRET_KEY: process.env.EXTENSION_SECRET || 'YOUR_SECRET_KEY_HERE',
};
