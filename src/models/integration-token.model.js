const { pool } = require("../db");
const { encryptJson, decryptJson } = require("../services/encryption.service");

const records = new Map();

function keyFor(userId, provider) {
  return `${userId}:${provider}`;
}

async function save(userId, provider, tokens) {
  const encrypted = encryptJson(tokens);
  if (pool) {
    await pool.query(
      `INSERT INTO user_integrations (user_id, provider, ciphertext, iv, auth_tag)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, provider) DO UPDATE SET
         ciphertext = EXCLUDED.ciphertext,
         iv = EXCLUDED.iv,
         auth_tag = EXCLUDED.auth_tag,
         updated_at = NOW()`,
      [userId, provider, encrypted.ciphertext, encrypted.iv, encrypted.authTag],
    );
    return;
  }
  records.set(keyFor(userId, provider), encrypted);
}

async function find(userId, provider) {
  if (pool) {
    const result = await pool.query(
      `SELECT ciphertext, iv, auth_tag FROM user_integrations
       WHERE user_id = $1 AND provider = $2`,
      [userId, provider],
    );
    const row = result.rows[0];
    return row
      ? decryptJson({
          ciphertext: row.ciphertext,
          iv: row.iv,
          authTag: row.auth_tag,
        })
      : null;
  }
  const record = records.get(keyFor(userId, provider));
  return record ? decryptJson(record) : null;
}

async function remove(userId, provider) {
  if (pool) {
    const result = await pool.query(
      "DELETE FROM user_integrations WHERE user_id = $1 AND provider = $2",
      [userId, provider],
    );
    return result.rowCount > 0;
  }
  return records.delete(keyFor(userId, provider));
}

module.exports = { save, find, remove };
