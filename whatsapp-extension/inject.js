console.log('💉 WhatsApp Bridge Injected (DOM Observer Mode)!');

function extractMessageFromDOM(node) {
    try {
        // Look for the inner text span that contains the actual message
        const textSpan = node.querySelector('span.selectable-text[dir="ltr"] span');
        if (!textSpan) return null;

        // Try to figure out if it's incoming or outgoing based on the parent bubble structure
        const bubble = node.closest('.message-in, .message-out');
        const fromMe = bubble && bubble.classList.contains('message-out');

        return {
            id: 'msg_' + Date.now() + Math.random().toString(36).substr(2, 9),
            chat_id: 'unknown_chat@c.us', // Hard to extract from DOM without active chat context
            sender: fromMe ? 'Me' : 'Unknown',
            text_content: textSpan.innerText,
            from_me: fromMe ? 1 : 0,
            timestamp: Math.floor(Date.now() / 1000)
        };
    } catch(e) {
        return null;
    }
}

// Watch the screen for new chat bubbles
const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
            if (node.nodeType === 1 && typeof node.matches === 'function') {
                // If a new message row gets added to the chat pane
                if (node.matches('[role="row"]') || node.querySelector('[role="row"]')) {
                    const row = node.matches('[role="row"]') ? node : node.querySelector('[role="row"]');
                    const msgData = extractMessageFromDOM(row);
                    if (msgData) {
                        console.log('👀 Found new message bubble:', msgData.text_content);
                        window.postMessage({
                            type: 'new_message',
                            data: msgData
                        }, '*');
                    }
                }
            }
        }
    }
});

// Wait for the main WhatsApp app container to load, then start observing
const checkApp = setInterval(() => {
    const appBody = document.querySelector('#main') || document.body;
    if (appBody) {
        clearInterval(checkApp);
        console.log('✅ DOM Observer Started.');
        observer.observe(appBody, { childList: true, subtree: true });
    }
}, 1000);
