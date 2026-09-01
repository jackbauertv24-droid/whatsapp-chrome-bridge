const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const db = require('./db');
const { getSock } = require('./whatsapp');

const server = new Server(
    { name: 'whatsapp-api-gateway-mcp', version: '1.0.0' },
    { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: 'whatsapp_get_chats',
                description: 'Get a list of recent WhatsApp chats (JID, name, and unread count).',
                inputSchema: { type: 'object', properties: {} }
            },
            {
                name: 'whatsapp_get_history',
                description: 'Get the recent message history for a specific WhatsApp JID. Excellent for AI summarization.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        jid: { type: 'string', description: 'The JID of the chat (e.g., 1234567890@s.whatsapp.net)' },
                        limit: { type: 'number', description: 'Number of messages to retrieve (default 50)' }
                    },
                    required: ['jid']
                }
            },
            {
                name: 'whatsapp_send_message',
                description: 'Send a text message to a WhatsApp JID or phone number.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        to: { type: 'string', description: 'Phone number or JID' },
                        text: { type: 'string', description: 'Message content' }
                    },
                    required: ['to', 'text']
                }
            }
        ]
    };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const sock = getSock();

    try {
        if (name === 'whatsapp_get_chats') {
            const chats = db.db.prepare(`
                SELECT c.jid, COALESCE(cont.name, cont.push_name, c.name, 'Unknown') as name, c.unread_count 
                FROM chats c 
                LEFT JOIN contacts cont ON c.jid = cont.jid 
                ORDER BY c.updated_at DESC LIMIT 20
            `).all();
            return { content: [{ type: 'text', text: JSON.stringify(chats, null, 2) }] };
        }

        if (name === 'whatsapp_get_history') {
            const limit = args.limit || 50;
            const messages = db.db.prepare(`
                SELECT from_me, push_name, text_content, datetime(timestamp, 'unixepoch', 'localtime') as time 
                FROM messages 
                WHERE remote_jid = ? 
                ORDER BY timestamp DESC LIMIT ?
            `).all(args.jid, limit).reverse();
            return { content: [{ type: 'text', text: JSON.stringify(messages, null, 2) }] };
        }

        if (name === 'whatsapp_send_message') {
            if (!sock?.user) throw new Error('WhatsApp not connected');
            let jid = args.to.replace(/[^0-9]/g, '');
            if (!jid.includes('@')) jid = `${jid}@s.whatsapp.net`;
            
            const sent = await sock.sendMessage(jid, { text: args.text });
            return { content: [{ type: 'text', text: `Message sent successfully. ID: ${sent.key.id}` }] };
        }

        throw new Error(`Unknown tool: ${name}`);
    } catch (error) {
        return { isError: true, content: [{ type: 'text', text: error.message }] };
    }
});

async function startMCP() {
    // Connect MCP over standard input/output
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('🔌 MCP Server connected over stdio and listening for AI tool calls.');
}

module.exports = { startMCP };
