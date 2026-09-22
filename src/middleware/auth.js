const jwt = require("jsonwebtoken");
const userModel = require("../models/user.model");

const jwtSecret = process.env.JWT_SECRET;

function requireAuth(req, res, next) {
  if (!jwtSecret) {
    return res.status(500).json({ error: "Authentication is not configured" });
  }

  const header = req.get("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Authentication required" });

  try {
    const payload = jwt.verify(token, jwtSecret);
    const user = userModel.findById(payload.sub);
    if (!user) return res.status(401).json({ error: "Invalid authentication" });
    req.user = { id: user.id, email: user.email };
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

module.exports = { requireAuth };
