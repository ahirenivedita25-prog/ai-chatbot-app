const crypto = require("node:crypto");
const messages = [];

function create(message) {
  const record = {
    id: crypto.randomUUID(),
    ...message,
    createdAt: new Date().toISOString(),
  };
  messages.push(record);
  return record;
}

function list() {
  return [...messages];
}

module.exports = { create, list };
