function requireFields(payload, fields) {
  const missing = fields.filter((field) => {
    const value = payload?.[field];
    return value === undefined || value === null || value === "";
  });

  return missing;
}

function validateMessage(payload) {
  const missing = requireFields(payload, ["message"]);
  if (missing.length) {
    return {
      valid: false,
      error: `Missing required field: ${missing.join(", ")}`,
    };
  }

  if (
    typeof payload.message !== "string" ||
    payload.message.trim().length === 0 ||
    payload.message.length > 2000
  ) {
    return {
      valid: false,
      error: "message must be a string of 1-2000 characters",
    };
  }

  return { valid: true };
}

module.exports = { requireFields, validateMessage };
