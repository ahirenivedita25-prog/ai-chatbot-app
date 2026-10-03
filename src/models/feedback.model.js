const { pool } = require("../db");

const feedbackRecords = [];

async function create({ conversationId, userId, rating }) {
  const record = {
    conversationId: String(conversationId),
    userId,
    rating,
    createdAt: new Date().toISOString(),
  };
  if (pool) {
    const result = await pool.query(
      `INSERT INTO conversation_feedback (conversation_id, user_id, rating)
       VALUES ($1, $2, $3)
       ON CONFLICT (conversation_id, user_id)
       DO UPDATE SET rating = EXCLUDED.rating, created_at = NOW()
       RETURNING conversation_id, user_id, rating, created_at`,
      [conversationId, userId, rating],
    );
    return {
      conversationId: String(result.rows[0].conversation_id),
      userId: result.rows[0].user_id,
      rating: result.rows[0].rating,
      createdAt: result.rows[0].created_at.toISOString(),
    };
  }

  const existingIndex = feedbackRecords.findIndex(
    (item) =>
      item.conversationId === record.conversationId && item.userId === userId,
  );
  if (existingIndex >= 0) feedbackRecords.splice(existingIndex, 1);
  feedbackRecords.unshift(record);
  return record;
}

async function list({ limit = 100 } = {}) {
  if (pool) {
    const result = await pool.query(
      `SELECT conversation_id, user_id, rating, created_at
       FROM conversation_feedback ORDER BY created_at DESC LIMIT $1`,
      [limit],
    );
    return result.rows.map((row) => ({
      conversationId: String(row.conversation_id),
      userId: row.user_id,
      rating: row.rating,
      createdAt: row.created_at.toISOString(),
    }));
  }
  return feedbackRecords.slice(0, limit);
}

async function listForConversations(userId, conversationIds) {
  const ids = [...new Set(conversationIds.map(String))];
  if (!ids.length) return [];
  if (pool) {
    const result = await pool.query(
      `SELECT conversation_id, rating FROM conversation_feedback
       WHERE user_id = $1 AND conversation_id = ANY($2::bigint[])`,
      [userId, ids],
    );
    return result.rows.map((row) => ({
      conversationId: String(row.conversation_id),
      rating: row.rating,
    }));
  }
  return feedbackRecords
    .filter(
      (item) => item.userId === userId && ids.includes(item.conversationId),
    )
    .map(({ conversationId, rating }) => ({ conversationId, rating }));
}

module.exports = { create, list, listForConversations };
