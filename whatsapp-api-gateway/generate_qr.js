const QRCode = require('qrcode');
const fs = require('fs');
const execSync = require('child_process').execSync;

const logOutput = execSync("grep -o '\"qr\":\"[^\"]*\"' ./data/whatsapp.log | tail -n 1").toString();
const qrString = logOutput.split('"')[3];

QRCode.toFile('./data/qr.png', qrString, {
  color: {
    dark: '#000000',  
    light: '#FFFFFF' 
  },
  width: 400
}, function (err) {
  if (err) throw err;
  console.log('done');
});
