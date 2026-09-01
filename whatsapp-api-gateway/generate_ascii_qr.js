const qrcode = require('qrcode-terminal');
const fs = require('fs');

const logOutput = fs.readFileSync('./data/whatsapp.log', 'utf8');
const lines = logOutput.split('\n');
let latestQR = null;
for (let line of lines) {
    if (line.includes('"qr":')) {
        try {
            const data = JSON.parse(line);
            if (data.update && data.update.qr) {
                latestQR = data.update.qr;
            }
        } catch (e) {}
    }
}

if (latestQR) {
    qrcode.generate(latestQR, { small: true }, function (qrcode) {
        fs.writeFileSync('./data/ascii_qr.txt', qrcode);
        console.log("ASCII generated");
    });
} else {
    console.log("No QR found");
}
