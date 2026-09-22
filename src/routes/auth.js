const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const userModel = require("../models/user.model");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function issueToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, process.env.JWT_SECRET, {
    expiresIn: "2h",
  });
}

router.post("/register", async (req, res) => {
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
    return res
      .status(400)
      .json({ error: "Use a valid email and a password of 8-128 characters" });
  }
  if (userModel.findByEmail(email))
    return res.status(409).json({ error: "Unable to create account" });

  const passwordHash = await bcrypt.hash(password, 12);
  const user = userModel.create({ email, passwordHash });
  return res
    .status(201)
    .json({
      token: issueToken(user),
      user: { id: user.id, email: user.email },
    });
});

router.post("/login", async (req, res) => {
  const email =
    typeof req.body?.email === "string"
      ? req.body.email.trim().toLowerCase()
      : "";
  const password = req.body?.password;
  const user = userModel.findByEmail(email);
  const valid =
    user &&
    typeof password === "string" &&
    (await bcrypt.compare(password, user.passwordHash));
  if (!valid)
    return res.status(401).json({ error: "Invalid email or password" });
  return res.json({
    token: issueToken(user),
    user: { id: user.id, email: user.email },
  });
});

router.get("/me", requireAuth, (req, res) => res.json({ user: req.user }));

module.exports = router;
