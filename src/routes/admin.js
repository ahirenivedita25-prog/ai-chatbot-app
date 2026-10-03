const express = require("express");
const auditModel = require("../models/audit.model");
const conversationModel = require("../models/conversation.model");
const failedQueryModel = require("../models/failed-query.model");
const feedbackModel = require("../models/feedback.model");
const { requireAdmin } = require("../middleware/auth");
const { modelVersion } = require("../services/chat.service");

const router = express.Router();
router.use(requireAdmin);
router.use((req, res, next) => {
  auditModel
    .create({
      userId: req.user.id,
      action: `admin.${req.method.toLowerCase()}${req.path}`,
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    })
    .then(() => next())
    .catch(next);
});

router.get("/settings", (_req, res) => {
  try {
    return res.json({
      modelVersion: modelVersion(),
      sessionMinutes: 15,
      refreshDays: 7,
      attachmentScanning: Boolean(process.env.CLAMAV_HOST),
    });
  } catch {
    return res.status(500).json({ error: "Settings are unavailable" });
  }
});

router.get("/audit", async (_req, res, next) => {
  try {
    return res.json({ events: await auditModel.list({ limit: 100 }) });
  } catch (error) {
    return next(error);
  }
});

router.get("/failed-queries", async (_req, res, next) => {
  try {
    return res.json({ failures: await failedQueryModel.list({ limit: 100 }) });
  } catch (error) {
    return next(error);
  }
});

router.get("/feedback", async (_req, res, next) => {
  try {
    return res.json({ feedback: await feedbackModel.list({ limit: 100 }) });
  } catch (error) {
    return next(error);
  }
});

router.get("/conversations", async (_req, res, next) => {
  try {
    return res.json({
      conversations: await conversationModel.list({ limit: 100 }),
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/help", (_req, res) =>
  res.json({
    topics: [
      "Only share records you are authorized to access.",
      "Uploaded images and text files are scanned before use.",
      "Contact your workspace owner for account and access changes.",
    ],
  }),
);

module.exports = router;
