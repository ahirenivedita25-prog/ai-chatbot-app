const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("node:crypto");
const userModel = require("../models/user.model");
const sessionModel = require("../models/session.model");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const refreshCookieName = "moonlit_refresh";
const refreshLifetimeMs = 7 * 24 * 60 * 60 * 1000;

function asyncRoute(handler) {
  return (req, res, next) =>
    Promise.resolve(handler(req, res, next)).catch(next);
}

function issueAccessToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      jti: crypto.randomUUID(),
    },
    process.env.JWT_SECRET,
    { expiresIn: "15m", algorithm: "HS256" },
  );
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api/auth",
    maxAge: refreshLifetimeMs,
  };
}

function clearRefreshCookie(res) {
  const { maxAge, ...options } = cookieOptions();
  res.clearCookie(refreshCookieName, options);
}

function getCookie(req, name) {
  const cookieHeader = req.get("cookie") || "";
  const cookie = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  return cookie ? decodeURIComponent(cookie.slice(name.length + 1)) : null;
}

function requireSameOrigin(req, res, next) {
  const origin = req.get("origin");
  if (!origin) return next();
  try {
    if (new URL(origin).origin !== `${req.protocol}://${req.get("host")}`) {
      return res.status(403).json({ error: "Cross-origin request rejected" });
    }
  } catch {
    return res.status(403).json({ error: "Invalid request origin" });
  }
  return next();
}

async function createRefreshSession(user, res) {
  const refreshToken = crypto.randomBytes(48).toString("base64url");
  await sessionModel.create({
    tokenHash: sessionModel.hashToken(refreshToken),
    userId: user.id,
    expiresAt: new Date(Date.now() + refreshLifetimeMs),
  });
  res.cookie(refreshCookieName, refreshToken, cookieOptions());
}

function publicUser(user) {
  return { id: user.id, email: user.email, role: user.role };
}

function isAdminEmail(email) {
  return (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .includes(email);
}

router.post(
  "/register",
  requireSameOrigin,
  asyncRoute(async (req, res) => {
    const email =
      typeof req.body?.email === "string"
        ? req.body.email.trim().toLowerCase()
        : "";
    const password = req.body?.password;
    if (
      !emailPattern.test(email) ||
      typeof password !== "string" ||
      password.length < 8 ||
      password.length > 128
    ) {
      return res.status(400).json({
        error: "Use a valid email and a password of 8-128 characters",
      });
    }
    if (await userModel.findByEmail(email))
      return res.status(409).json({ error: "Unable to create account" });

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await userModel.create({
      email,
      passwordHash,
      role: isAdminEmail(email) ? "admin" : "user",
    });
    await createRefreshSession(user, res);
    return res
      .status(201)
      .json({ token: issueAccessToken(user), user: publicUser(user) });
  }),
);

router.post(
  "/login",
  requireSameOrigin,
  asyncRoute(async (req, res) => {
    const email =
      typeof req.body?.email === "string"
        ? req.body.email.trim().toLowerCase()
        : "";
    const password = req.body?.password;
    const user = await userModel.findByEmail(email);
    const valid =
      user &&
      typeof password === "string" &&
      (await bcrypt.compare(password, user.passwordHash));
    if (!valid)
      return res.status(401).json({ error: "Invalid email or password" });
    await createRefreshSession(user, res);
    return res.json({ token: issueAccessToken(user), user: publicUser(user) });
  }),
);

router.post(
  "/refresh",
  requireSameOrigin,
  asyncRoute(async (req, res) => {
    const refreshToken = getCookie(req, refreshCookieName);
    if (!refreshToken)
      return res.status(401).json({ error: "Session expired" });

    const userId = await sessionModel.consume(
      sessionModel.hashToken(refreshToken),
    );
    const user = userId ? await userModel.findById(userId) : null;
    if (!user) {
      clearRefreshCookie(res);
      return res.status(401).json({ error: "Session expired" });
    }

    await createRefreshSession(user, res);
    return res.json({ token: issueAccessToken(user), user: publicUser(user) });
  }),
);

router.post(
  "/logout",
  requireSameOrigin,
  asyncRoute(async (req, res) => {
    const refreshToken = getCookie(req, refreshCookieName);
    if (refreshToken)
      await sessionModel.revoke(sessionModel.hashToken(refreshToken));
    clearRefreshCookie(res);
    return res.status(204).end();
  }),
);

router.get("/me", requireAuth, (req, res) => res.json({ user: req.user }));

module.exports = router;
