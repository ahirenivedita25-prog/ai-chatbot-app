function log(level, message, context = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...context,
  };

  console[level === "error" ? "error" : "log"](JSON.stringify(entry));
}

module.exports = {
  info: (message, context) => log("info", message, context),
  error: (message, context) => log("error", message, context),
};
