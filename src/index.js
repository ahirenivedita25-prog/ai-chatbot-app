const app = require("./app");
const logger = require("./utils/logger");

const port = Number(process.env.PORT) || 3000;
let server;

function validateProductionConfiguration() {
  if (process.env.NODE_ENV !== "production") return;
  if (
    !process.env.JWT_SECRET ||
    Buffer.byteLength(process.env.JWT_SECRET) < 32
  ) {
    throw new Error("JWT_SECRET must be at least 32 bytes in production");
  }
  if (!process.env.DATA_ENCRYPTION_KEY) {
    throw new Error("DATA_ENCRYPTION_KEY is required in production");
  }
  if (!process.env.ADMIN_EMAILS?.trim()) {
    throw new Error("Set ADMIN_EMAILS to bootstrap at least one admin");
  }
}

function shutdown(signal) {
  logger.info(`Received ${signal}, shutting down`);
  server.close(() => process.exit(0));
}

if (require.main === module) {
  validateProductionConfiguration();
  app
    .initializeDatabase()
    .then(() => {
      server = app.listen(port, () =>
        logger.info(`API listening on port ${port}`),
      );
    })
    .catch((error) => {
      logger.error(`Startup failed: ${error.message}`);
      process.exitCode = 1;
    });

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

module.exports = app;
