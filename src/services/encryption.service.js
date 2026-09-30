const crypto = require("node:crypto");

const key = process.env.DATA_ENCRYPTION_KEY
  ? Buffer.from(process.env.DATA_ENCRYPTION_KEY, "base64")
  : crypto.randomBytes(32);

if (key.length !== 32) {
  throw new Error("DATA_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
}

function encryptJson(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

function decryptJson(record) {
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(record.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(record.authTag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(record.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
  return JSON.parse(plaintext);
}

module.exports = { encryptJson, decryptJson };
