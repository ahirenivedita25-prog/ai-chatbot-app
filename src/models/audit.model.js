const { pool } = require("../db");

const events = [];

async function create({ userId, action, ipAddress, userAgent }) {
  const event = {
    userId,
    action,
    ipAddress,
    userAgent,
    createdAt: new Date().toISOString(),
  };
  if (pool) {
    await pool.query(
      `INSERT INTO admin_audit (user_id, action, ip_address, user_agent)
       VALUES ($1, $2, $3, $4)`,
      [userId, action, ipAddress || null, userAgent || null],
    );
  } else {
    events.unshift(event);
  }
  return event;
}

async function list({ limit = 100 } = {}) {
  if (pool) {
    const result = await pool.query(
      `SELECT user_id, action, ip_address, user_agent, created_at
       FROM admin_audit ORDER BY created_at DESC LIMIT $1`,
      [limit],
    );
    return result.rows.map((row) => ({
      userId: row.user_id,
      action: row.action,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      createdAt: row.created_at,
    }));
  }
  return events.slice(0, limit);
}

module.exports = { create, list };
