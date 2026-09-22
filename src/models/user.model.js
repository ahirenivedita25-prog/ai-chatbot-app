const crypto = require("node:crypto");
const users = new Map();

function create(user) {
  const record = {
    id: user.id || crypto.randomUUID(),
    ...user,
    createdAt: new Date().toISOString(),
  };
  users.set(record.id, record);
  return record;
}

function findById(id) {
  return users.get(id);
}

function findByEmail(email) {
  return [...users.values()].find((user) => user.email === email);
}

module.exports = { create, findById, findByEmail };
