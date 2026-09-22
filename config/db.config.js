require("dotenv").config();

module.exports = {
  url: process.env.DATABASE_URL || "memory://local",
  provider: process.env.DATABASE_PROVIDER || "memory",
};
