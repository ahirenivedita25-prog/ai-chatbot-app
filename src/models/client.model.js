const crypto = require("node:crypto");
const clients = new Map();

function create(client) {
  const record = {
    id: client.id || crypto.randomUUID(),
    ...client,
    createdAt: new Date().toISOString(),
  };
  clients.set(record.id, record);
  return record;
}

function findById(id) {
  return clients.get(id);
}

module.exports = { create, findById };
