const { pool } = require("../db");
const { encryptJson, decryptJson } = require("../services/encryption.service");

const records = [];

function present(record) {
  return {
    id: String(record.id),
    userId: record.userId,
    category: record.category,
    status: record.status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    ...decryptJson(record),
  };
}

async function create({ userId, category, details }) {
  const encrypted = encryptJson({ details });
  const now = new Date().toISOString();
  const record = {
    userId,
    category,
    status: "received",
    ...encrypted,
    createdAt: now,
    updatedAt: now,
  };

  if (pool) {
    const result = await pool.query(
      `INSERT INTO service_requests
        (user_id, category, ciphertext, iv, auth_tag)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, user_id, category, status, ciphertext, iv, auth_tag,
                 created_at, updated_at`,
      [userId, category, encrypted.ciphertext, encrypted.iv, encrypted.authTag],
    );
    const row = result.rows[0];
    return present({
      id: row.id,
      userId: row.user_id,
      category: row.category,
      status: row.status,
      ciphertext: row.ciphertext,
      iv: row.iv,
      authTag: row.auth_tag,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }

  record.id = String(records.length + 1);
  records.push(record);
  return present(record);
}

async function list({ userId, limit = 100 } = {}) {
  if (pool) {
    const result = userId
      ? await pool.query(
          `SELECT id, user_id, category, status, ciphertext, iv, auth_tag,
                  created_at, updated_at
           FROM service_requests WHERE user_id = $1
           ORDER BY created_at DESC LIMIT $2`,
          [userId, limit],
        )
      : await pool.query(
          `SELECT id, user_id, category, status, ciphertext, iv, auth_tag,
                  created_at, updated_at
           FROM service_requests ORDER BY created_at DESC LIMIT $1`,
          [limit],
        );
    return result.rows.map((row) =>
      present({
        id: row.id,
        userId: row.user_id,
        category: row.category,
        status: row.status,
        ciphertext: row.ciphertext,
        iv: row.iv,
        authTag: row.auth_tag,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }),
    );
  }

  return records
    .filter((record) => !userId || record.userId === userId)
    .slice(-limit)
    .reverse()
    .map(present);
}

async function updateStatus(id, status) {
  if (pool) {
    if (!/^\d+$/.test(String(id))) return null;
    const result = await pool.query(
      `UPDATE service_requests SET status = $2, updated_at = NOW()
       WHERE id = $1
       RETURNING id, user_id, category, status, ciphertext, iv, auth_tag,
                 created_at, updated_at`,
      [id, status],
    );
    const row = result.rows[0];
    return row
      ? present({
          id: row.id,
          userId: row.user_id,
          category: row.category,
          status: row.status,
          ciphertext: row.ciphertext,
          iv: row.iv,
          authTag: row.auth_tag,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        })
      : null;
  }

  const record = records.find((item) => String(item.id) === String(id));
  if (!record) return null;
  record.status = status;
  record.updatedAt = new Date().toISOString();
  return present(record);
}

module.exports = { create, list, updateStatus };
