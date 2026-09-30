const crypto = require("node:crypto");
const { pool } = require("../db");
const users = new Map();

function create(user) {
  const role = user.role === "admin" ? "admin" : "user";
  const record = {
    id: user.id || crypto.randomUUID(),
    ...user,
    role,
    createdAt: new Date().toISOString(),
  };
  if (pool) {
    return pool
      .query(
        `INSERT INTO users (id, email, password_hash, role)
         VALUES ($1, $2, $3, $4)
         RETURNING id, email, password_hash, role, created_at`,
        [record.id, record.email, record.passwordHash, role],
      )
      .then(({ rows }) => toUser(rows[0]));
  }
  users.set(record.id, record);
  return record;
}

function findById(id) {
  if (pool) {
    return pool
      .query(
        "SELECT id, email, password_hash, role, created_at FROM users WHERE id = $1",
        [id],
      )
      .then(({ rows }) => (rows[0] ? toUser(rows[0]) : null));
  }
  return users.get(id);
}

function findByEmail(email) {
  if (pool) {
    return pool
      .query(
        "SELECT id, email, password_hash, role, created_at FROM users WHERE email = $1",
        [email],
      )
      .then(({ rows }) => (rows[0] ? toUser(rows[0]) : null));
  }
  return [...users.values()].find((user) => user.email === email);
}

function toUser(row) {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    role: row.role,
    createdAt: row.created_at.toISOString(),
  };
}

module.exports = { create, findById, findByEmail };
