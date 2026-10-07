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
  threadId,
  label,
}) {
  const encrypted = encryptJson({ message, reply });
  const thread = threadId || crypto.randomUUID();
  const record = {
    id: crypto.randomUUID(),
    userId,
    industry,
    intent,
    modelVersion,
    threadId: thread,
    label: label || null,
    ...encrypted,
    createdAt: new Date().toISOString(),
  };

  if (pool) {
    const result = await pool.query(
      `INSERT INTO conversations
        (user_id, industry, intent, model_version, ciphertext, iv, auth_tag, thread_id, label)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, created_at, thread_id`,
      [
        userId,
        industry,
        intent,
        modelVersion,
        encrypted.ciphertext,
        encrypted.iv,
        encrypted.authTag,
        thread,
        label || null,
      ],
    );
    record.id = result.rows[0].id;
    record.createdAt = result.rows[0].created_at.toISOString();
    record.threadId = result.rows[0].thread_id;
  } else {
    records.push(record);
  }
  return {
    id: record.id,
    threadId: record.threadId,
    createdAt: record.createdAt,
  };
}

async function existsForUser(id, userId) {
  if (pool) {
    if (!/^\d+$/.test(String(id))) return false;
    const result = await pool.query(
      "SELECT 1 FROM conversations WHERE id = $1 AND user_id = $2",
      [id, userId],
    );
    return result.rowCount > 0;
  }
  return records.some(
    (record) => String(record.id) === String(id) && record.userId === userId,
  );
}

async function list({ limit = 100 } = {}) {
  if (pool) {
    const result = await pool.query(
      `SELECT id, user_id, industry, intent, model_version, ciphertext, iv,
              auth_tag, created_at, thread_id, label
       FROM conversations ORDER BY created_at DESC LIMIT $1`,
      [limit],
    );
    return result.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      industry: row.industry,
      intent: row.intent,
      modelVersion: row.model_version,
      threadId: row.thread_id,
      label: row.label,
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
      threadId: record.threadId || String(record.id),
      label: record.label || null,
      createdAt: record.createdAt,
      ...decryptJson(record),
    }));
}

async function listForUser(userId, { limit = 100 } = {}) {
  if (pool) {
    const result =
      limit === null
        ? await pool.query(
            `SELECT id, user_id, industry, intent, model_version, ciphertext, iv,
                    auth_tag, created_at, thread_id, label
             FROM conversations WHERE user_id = $1
             ORDER BY created_at DESC`,
            [userId],
          )
        : await pool.query(
            `SELECT id, user_id, industry, intent, model_version, ciphertext, iv,
                    auth_tag, created_at, thread_id, label
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
      threadId: row.thread_id,
      label: row.label,
      createdAt: row.created_at,
      ...decryptJson({
        ciphertext: row.ciphertext,
        iv: row.iv,
        authTag: row.auth_tag,
      }),
    }));
  }

  const userRecords = records.filter((record) => record.userId === userId);
  return (limit === null ? userRecords : userRecords.slice(-limit))
    .reverse()
    .map((record) => ({
      id: record.id,
      userId: record.userId,
      industry: record.industry,
      intent: record.intent,
      modelVersion: record.modelVersion,
      threadId: record.threadId || String(record.id),
      label: record.label || null,
      createdAt: record.createdAt,
      ...decryptJson(record),
    }));
}

async function listThreadsForUser(
  userId,
  { limit = 500, search = "", industry = "" } = {},
) {
  const exchanges = await listForUser(userId, {
    limit: search.trim() ? null : limit * 2,
  });
  const byThread = new Map();
  for (const exchange of [...exchanges].reverse()) {
    if (industry && exchange.industry !== industry) continue;
    const threadId = String(exchange.threadId || exchange.id);
    const thread = byThread.get(threadId) || {
      id: threadId,
      label: exchange.label || null,
      industry: exchange.industry,
      createdAt: exchange.createdAt,
      messages: [],
    };
    thread.messages.push(
      { id: `${exchange.id}-question`, role: "user", text: exchange.message },
      {
        id: `${exchange.id}-answer`,
        role: "assistant",
        text: exchange.reply,
        conversationId: String(exchange.id),
      },
    );
    if (new Date(exchange.createdAt) < new Date(thread.createdAt))
      thread.createdAt = exchange.createdAt;
    byThread.set(threadId, thread);
  }
  const normalizedSearch = search.trim().toLowerCase();
  return [...byThread.values()]
    .map((thread) => ({
      ...thread,
      title:
        thread.label ||
        thread.messages.find((message) => message.role === "user")?.text ||
        "New conversation",
    }))
    .filter(
      (thread) =>
        !normalizedSearch ||
        `${thread.title} ${thread.messages.map((message) => message.text).join(" ")}`
          .toLowerCase()
          .includes(normalizedSearch),
    )
    .sort(
      (first, second) => new Date(second.createdAt) - new Date(first.createdAt),
    )
    .slice(0, limit);
}

async function setThreadLabel(userId, threadId, label) {
  if (pool) {
    const result = await pool.query(
      `UPDATE conversations SET label = $3
       WHERE user_id = $1 AND thread_id = $2 RETURNING thread_id`,
      [userId, threadId, label],
    );
    return result.rowCount > 0;
  }
  const matches = records.filter(
    (record) =>
      record.userId === userId &&
      String(record.threadId || record.id) === String(threadId),
  );
  for (const record of matches) record.label = label;
  return matches.length > 0;
}

module.exports = {
  create,
  list,
  listForUser,
  listThreadsForUser,
  setThreadLabel,
  existsForUser,
};
