require("dotenv").config();
const express = require("express");
const schoolRoutes = require("./routes/school");
const clinicRoutes = require("./routes/clinic");
const retailRoutes = require("./routes/retail");
const restaurantRoutes = require("./routes/restaurant");
const authRoutes = require("./routes/auth");
const { requireAuth } = require("./middleware/auth");
const path = require("node:path");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const app = express();
app.disable("x-powered-by");
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "20kb" }));
app.use(express.static(path.join(__dirname, "../public")));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again later." },
});

app.get("/chat-status", (req, res) => {
  res.json({ status: "ok", service: "ai-chatbot-startup" });
});

app.use("/api", apiLimiter);
app.use("/api/auth", authRoutes);
app.use("/api/school", requireAuth, schoolRoutes);
app.use("/api/clinic", requireAuth, clinicRoutes);
app.use("/api/retail", requireAuth, retailRoutes);
app.use("/api/restaurant", requireAuth, restaurantRoutes);

app.use((error, req, res, next) => {
  if (
    error instanceof SyntaxError &&
    error.status === 400 &&
    error.type === "entity.parse.failed"
  ) {
    return res.status(400).json({ error: "Request body must be valid JSON" });
  }
  console.error(error);
  return res.status(500).json({ error: "Internal server error" });
});

module.exports = app;
