require("dotenv").config();
const express = require("express");
const authRoutes = require("./routes/auth");
const adminRoutes = require("./routes/admin");
const conversationRoutes = require("./routes/conversations");
const { createChatRouter } = require("./routes/chat");
const { requireAuth } = require("./middleware/auth");
const { initializeDatabase } = require("./db");
const path = require("node:path");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    hsts: { maxAge: 31_536_000, includeSubDomains: true },
  }),
);
app.use(express.json({ limit: "8mb" }));
app.use((req, res, next) => {
  if (process.env.NODE_ENV === "production" && !req.secure) {
    if (req.path === "/chat-status") return next();
    if (req.path.startsWith("/api/")) {
      return res.status(426).json({ error: "HTTPS is required" });
    }
    return res.redirect(308, `https://${req.get("host")}${req.originalUrl}`);
  }
  return next();
});
app.use(express.static(path.join(__dirname, "../dist")));
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
app.use(
  "/api/auth",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 15,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Too many authentication attempts" },
  }),
  authRoutes,
);
const userLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  keyGenerator: (req) => req.user.id,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Chat request limit reached" },
});
app.use("/api/school", requireAuth, userLimiter, createChatRouter("school"));
app.use("/api/clinic", requireAuth, userLimiter, createChatRouter("clinic"));
app.use("/api/retail", requireAuth, userLimiter, createChatRouter("retail"));
app.use(
  "/api/restaurant",
  requireAuth,
  userLimiter,
  createChatRouter("restaurant"),
);
app.use("/api/conversations", requireAuth, userLimiter, conversationRoutes);
app.use("/api/admin", requireAuth, userLimiter, adminRoutes);

app.get("*", (req, res, next) => {
  if (req.method !== "GET" || req.path.startsWith("/api/")) return next();
  return res.sendFile(path.join(__dirname, "../dist/index.html"), (error) => {
    if (error)
      return res.sendFile(path.join(__dirname, "../public/index.html"));
  });
});

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
module.exports.initializeDatabase = initializeDatabase;
