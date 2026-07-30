const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ALGORITHM = 'aes-256-cbc';
const SECRET_KEY = crypto.createHash('sha256').update(process.env.JWT_SECRET || 'default-secret').digest();
const IV_LENGTH = 16;

function encryptBuffer(buffer) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, SECRET_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  return Buffer.concat([iv, encrypted]);
}

function decryptBuffer(encryptedBuffer) {
  const iv = encryptedBuffer.subarray(0, IV_LENGTH);
  const data = encryptedBuffer.subarray(IV_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, SECRET_KEY, iv);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

function encryptFile(inputPath, outputPath) {
  const inputBuf = fs.readFileSync(inputPath);
  const encrypted = encryptBuffer(inputBuf);
  fs.writeFileSync(outputPath, encrypted);
  return encrypted.length;
}

function decryptFile(encryptedPath) {
  const encryptedBuf = fs.readFileSync(encryptedPath);
  return decryptBuffer(encryptedBuf);
}

module.exports = { encryptBuffer, decryptBuffer, encryptFile, decryptFile };
