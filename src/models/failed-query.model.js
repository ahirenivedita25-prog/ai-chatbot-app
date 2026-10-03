const { pool } = require("../db");

const records = [];

async function create({ userId, industry, modelVersion, errorType }) {
  const record = {
    userId,
    industry,
    modelVersion,
    errorType,
    createdAt: new Date().toISOString(),
  };

  if (pool) {
    await pool.query(
      `INSERT INTO failed_queries (user_id, industry, model_version, error_type)
       VALUES ($1, $2, $3, $4)`,
      [userId, industry, modelVersion, errorType],
    );
  } else {
    records.unshift(record);
  }
  return record;
}

async function list({ limit = 100 } = {}) {
  if (pool) {
    const result = await pool.query(
      `SELECT user_id, industry, model_version, error_type, created_at
       FROM failed_queries ORDER BY created_at DESC LIMIT $1`,
      [limit],
    );
    return result.rows.map((row) => ({
      userId: row.user_id,
      industry: row.industry,
      modelVersion: row.model_version,
      errorType: row.error_type,
      createdAt: row.created_at,
    }));
  }
  return records.slice(0, limit);
}

module.exports = { create, list };
