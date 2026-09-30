const crypto = require("node:crypto");
const { pool } = require("../db");

const sessions = new Map();

async function create({ tokenHash, userId, expiresAt }) {
  if (pool) {
    await pool.query(
      "INSERT INTO refresh_sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)",
      [tokenHash, userId, expiresAt],
    );
    return;
  }
  sessions.set(tokenHash, { userId, expiresAt: new Date(expiresAt).getTime() });
}

async function consume(tokenHash) {
  if (pool) {
    const result = await pool.query(
      "DELETE FROM refresh_sessions WHERE token_hash = $1 AND expires_at > NOW() RETURNING user_id",
      [tokenHash],
    );
    return result.rows[0]?.user_id || null;
  }
  const session = sessions.get(tokenHash);
  sessions.delete(tokenHash);
  return session && session.expiresAt > Date.now() ? session.userId : null;
}

async function revoke(tokenHash) {
  if (pool) {
    await pool.query("DELETE FROM refresh_sessions WHERE token_hash = $1", [
      tokenHash,
    ]);
    return;
  }
  sessions.delete(tokenHash);
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

module.exports = { create, consume, revoke, hashToken };
