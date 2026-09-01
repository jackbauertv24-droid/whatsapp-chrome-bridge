const Database = require('better-sqlite3');
const { DB_PATH } = require('./config');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        chat_id TEXT,
        sender TEXT,
        text_content TEXT,
        from_me BOOLEAN,
        timestamp INTEGER
    );
`);

const insertMessage = db.prepare(`
    INSERT OR IGNORE INTO messages (id, chat_id, sender, text_content, from_me, timestamp)
    VALUES (@id, @chat_id, @sender, @text_content, @from_me, @timestamp)
`);

module.exports = { db, insertMessage };
