const crypto = require("node:crypto");
const { pool } = require("../db");
const { encryptJson, decryptJson } = require("../services/encryption.service");

const records = [];

async function create({
  userId,
  industry,
  intent,
  modelVersion,
  message,
  reply,
}) {
  const encrypted = encryptJson({ message, reply });
  const record = {
    id: crypto.randomUUID(),
    userId,
    industry,
    intent,
    modelVersion,
    ...encrypted,
    createdAt: new Date().toISOString(),
  };

  if (pool) {
    await pool.query(
      `INSERT INTO conversations
        (user_id, industry, intent, model_version, ciphertext, iv, auth_tag)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        userId,
        industry,
        intent,
        modelVersion,
        encrypted.ciphertext,
        encrypted.iv,
        encrypted.authTag,
      ],
    );
  } else {
    records.push(record);
  }
  return { id: record.id, createdAt: record.createdAt };
}

async function list({ limit = 100 } = {}) {
  if (pool) {
    const result = await pool.query(
      `SELECT id, user_id, industry, intent, model_version, ciphertext, iv,
              auth_tag, created_at
       FROM conversations ORDER BY created_at DESC LIMIT $1`,
      [limit],
    );
    return result.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      industry: row.industry,
      intent: row.intent,
      modelVersion: row.model_version,
      createdAt: row.created_at,
      ...decryptJson({
        ciphertext: row.ciphertext,
        iv: row.iv,
        authTag: row.auth_tag,
      }),
    }));
  }

  return records
    .slice(-limit)
    .reverse()
    .map((record) => ({
      id: record.id,
      userId: record.userId,
      industry: record.industry,
      intent: record.intent,
      modelVersion: record.modelVersion,
      createdAt: record.createdAt,
      ...decryptJson(record),
    }));
}

async function listForUser(userId, { limit = 100 } = {}) {
  if (pool) {
    const result = await pool.query(
      `SELECT id, user_id, industry, intent, model_version, ciphertext, iv,
              auth_tag, created_at
       FROM conversations WHERE user_id = $1
       ORDER BY created_at DESC LIMIT $2`,
      [userId, limit],
    );
    return result.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      industry: row.industry,
      intent: row.intent,
      modelVersion: row.model_version,
      createdAt: row.created_at,
      ...decryptJson({
        ciphertext: row.ciphertext,
        iv: row.iv,
        authTag: row.auth_tag,
      }),
    }));
  }

  return records
    .filter((record) => record.userId === userId)
    .slice(-limit)
    .reverse()
    .map((record) => ({
      id: record.id,
      userId: record.userId,
      industry: record.industry,
      intent: record.intent,
      modelVersion: record.modelVersion,
      createdAt: record.createdAt,
      ...decryptJson(record),
    }));
}

module.exports = { create, list, listForUser };
