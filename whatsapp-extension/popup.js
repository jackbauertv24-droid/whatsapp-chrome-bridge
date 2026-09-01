document.addEventListener('DOMContentLoaded', () => {
    chrome.storage.local.get(['API_URL', 'SECRET_KEY'], (data) => {
        if (data.API_URL) document.getElementById('apiUrl').value = data.API_URL;
        if (data.SECRET_KEY) document.getElementById('secretKey').value = data.SECRET_KEY;
    });
});

document.getElementById('saveBtn').addEventListener('click', () => {
    let url = document.getElementById('apiUrl').value.trim();
    if (url.endsWith('/')) url = url.slice(0, -1);
    const key = document.getElementById('secretKey').value.trim();
    
    chrome.storage.local.set({ API_URL: url, SECRET_KEY: key }, () => {
        document.getElementById('status').style.display = 'block';
        setTimeout(() => window.close(), 1500);
    });
});
