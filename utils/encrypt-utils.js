const crypto = require("crypto");

// Environment variables
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY; // 32 characters for AES-256
if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 32) {
  throw new Error('Encryption key must be exactly 32 characters long.');
}

const encrypt = (text) => {
  const cipher = crypto.createCipheriv("aes-256-ctr", ENCRYPTION_KEY, Buffer.alloc(16, 0));
  const encrypted = Buffer.concat([cipher.update(text), cipher.final()]);
  return encrypted.toString("hex");
};

// Decryption helper
const decrypt = (encryptedText) => {
  const decipher = crypto.createDecipheriv("aes-256-ctr", ENCRYPTION_KEY, Buffer.alloc(16, 0));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(encryptedText, "hex")), decipher.final()]);
  return decrypted.toString();
};

module.exports = { encrypt, decrypt };
