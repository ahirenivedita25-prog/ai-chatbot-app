const app = require("./app");
const logger = require("./utils/logger");

const port = Number(process.env.PORT) || 3000;
let server;

function shutdown(signal) {
  logger.info(`Received ${signal}, shutting down`);
  server.close(() => process.exit(0));
}

if (require.main === module) {
  server = app.listen(port, () => logger.info(`API listening on port ${port}`));

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

module.exports = app;
