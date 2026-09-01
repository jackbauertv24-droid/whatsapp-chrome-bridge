// Inject the Webpack Hijacker into the page context
const script = document.createElement('script');
script.src = chrome.runtime.getURL('inject.js');
(document.head || document.documentElement).appendChild(script);

// Listen for messages from the injected script and forward to Background Worker
window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (event.data.type === 'new_message') {
        chrome.runtime.sendMessage(event.data);
    }
});

// Listen for commands from the Background Worker and forward to Injected Script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'send_message') {
        window.postMessage(request, '*');
    }
});
