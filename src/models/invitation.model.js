const crypto = require("node:crypto");
const { pool } = require("../db");

const invitations = new Map();

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function create({ email, role, invitedBy, expiresAt }) {
  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  let invitation;
  if (pool) {
    const result = await pool.query(
      `INSERT INTO invitations (email, role, token_hash, invited_by, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, email, role, invited_by, expires_at, created_at`,
      [email, role, tokenHash, invitedBy, expiresAt],
    );
    invitation = result.rows[0];
  } else {
    invitation = {
      id: crypto.randomUUID(),
      email,
      role,
      invited_by: invitedBy,
      expires_at: expiresAt,
      created_at: new Date(),
      accepted_at: null,
    };
    invitations.set(tokenHash, invitation);
  }
  return {
    token,
    invitation: {
      id: String(invitation.id),
      email: invitation.email,
      role: invitation.role,
      invitedBy: invitation.invited_by,
      expiresAt: new Date(invitation.expires_at).toISOString(),
      createdAt: new Date(invitation.created_at).toISOString(),
    },
  };
}

async function findValid(token, email) {
  if (typeof token !== "string" || token.length > 128) return null;
  const tokenHash = hashToken(token);
  if (pool) {
    const result = await pool.query(
      `SELECT id, email, role, expires_at FROM invitations
       WHERE token_hash = $1 AND accepted_at IS NULL AND expires_at > NOW()`,
      [tokenHash],
    );
    const record = result.rows[0];
    return record && record.email === email
      ? { id: record.id, email: record.email, role: record.role }
      : null;
  }
  const record = invitations.get(tokenHash);
  return record &&
    !record.accepted_at &&
    new Date(record.expires_at) > new Date() &&
    record.email === email
    ? { id: record.id, email: record.email, role: record.role }
    : null;
}

async function preview(token) {
  if (typeof token !== "string" || token.length > 128) return null;
  const tokenHash = hashToken(token);
  if (pool) {
    const result = await pool.query(
      `SELECT email, role, expires_at FROM invitations
       WHERE token_hash = $1 AND accepted_at IS NULL AND expires_at > NOW()`,
      [tokenHash],
    );
    const row = result.rows[0];
    return row
      ? {
          email: row.email,
          role: row.role,
          expiresAt: row.expires_at.toISOString(),
        }
      : null;
  }
  const record = invitations.get(tokenHash);
  return record &&
    !record.accepted_at &&
    new Date(record.expires_at) > new Date()
    ? {
        email: record.email,
        role: record.role,
        expiresAt: new Date(record.expires_at).toISOString(),
      }
    : null;
}

async function accept(id) {
  if (pool) {
    const result = await pool.query(
      `UPDATE invitations SET accepted_at = NOW()
       WHERE id = $1 AND accepted_at IS NULL AND expires_at > NOW()
       RETURNING id`,
      [id],
    );
    return result.rowCount === 1;
  }
  for (const record of invitations.values()) {
    if (
      String(record.id) === String(id) &&
      !record.accepted_at &&
      new Date(record.expires_at) > new Date()
    ) {
      record.accepted_at = new Date();
      return true;
    }
  }
  return false;
}

async function list({ limit = 100 } = {}) {
  if (pool) {
    const result = await pool.query(
      `SELECT id, email, role, invited_by, expires_at, accepted_at, created_at
       FROM invitations ORDER BY created_at DESC LIMIT $1`,
      [limit],
    );
    return result.rows.map((row) => ({
      id: String(row.id),
      email: row.email,
      role: row.role,
      invitedBy: row.invited_by,
      expiresAt: row.expires_at.toISOString(),
      acceptedAt: row.accepted_at?.toISOString() || null,
      createdAt: row.created_at.toISOString(),
    }));
  }
  return [...invitations.values()].slice(0, limit).map((row) => ({
    id: String(row.id),
    email: row.email,
    role: row.role,
    invitedBy: row.invited_by,
    expiresAt: new Date(row.expires_at).toISOString(),
    acceptedAt: row.accepted_at?.toISOString() || null,
    createdAt: new Date(row.created_at).toISOString(),
  }));
}

async function revoke(id) {
  if (pool) {
    const result = await pool.query(
      "DELETE FROM invitations WHERE id = $1 AND accepted_at IS NULL",
      [id],
    );
    return result.rowCount > 0;
  }
  for (const [tokenHash, record] of invitations) {
    if (String(record.id) === String(id) && !record.accepted_at) {
      invitations.delete(tokenHash);
      return true;
    }
  }
  return false;
}

module.exports = { create, findValid, preview, accept, list, revoke };
