const express = require("express");
const auditModel = require("../models/audit.model");
const conversationModel = require("../models/conversation.model");
const failedQueryModel = require("../models/failed-query.model");
const feedbackModel = require("../models/feedback.model");
const invitationModel = require("../models/invitation.model");
const { pool } = require("../db");
const { requireAdmin } = require("../middleware/auth");
const { modelVersion } = require("../services/chat.service");
const analyticsService = require("../services/analytics.service");

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
      imageEnhancement: Boolean(
        process.env.IMAGE_API_URL && process.env.IMAGE_API_KEY,
      ),
    });
  } catch {
    return res.status(500).json({ error: "Settings are unavailable" });
  }
});

router.get("/integrations", (_req, res) => {
  return res.json({
    integrations: [
      {
        name: "Jira",
        configured: Boolean(
          process.env.JIRA_BASE_URL &&
          process.env.JIRA_EMAIL &&
          process.env.JIRA_API_TOKEN,
        ),
        setup: "Search Jira issues from the admin workspace",
      },
      {
        name: "Confluence",
        configured: Boolean(
          process.env.CONFLUENCE_BASE_URL &&
          process.env.CONFLUENCE_EMAIL &&
          process.env.CONFLUENCE_API_TOKEN,
        ),
        setup: "Search Confluence pages from the admin workspace",
      },
      {
        name: "Slack",
        configured: Boolean(process.env.SLACK_BOT_TOKEN),
        setup: "Search Slack messages from the admin workspace",
      },
      {
        name: "Google Drive",
        configured: Boolean(
          process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
        ),
        setup: "OAuth file import is available in the chat composer",
      },
      {
        name: "OneDrive",
        configured: Boolean(
          process.env.MICROSOFT_CLIENT_ID &&
          process.env.MICROSOFT_CLIENT_SECRET,
        ),
        setup: "OAuth file import is available in the chat composer",
      },
    ],
  });
});

router.get("/invites", async (_req, res, next) => {
  try {
    return res.json({
      invitations: await invitationModel.list({ limit: 100 }),
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/invites", async (req, res, next) => {
  const email =
    typeof req.body?.email === "string"
      ? req.body.email.trim().toLowerCase()
      : "";
  const role = req.body?.role;
  const expiresHours = Number(req.body?.expiresHours || 72);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return res.status(400).json({ error: "Enter a valid email address" });
  }
  if (!["admin", "editor", "viewer"].includes(role)) {
    return res
      .status(400)
      .json({ error: "Role must be admin, editor, or viewer" });
  }
  if (
    !Number.isFinite(expiresHours) ||
    expiresHours < 1 ||
    expiresHours > 720
  ) {
    return res
      .status(400)
      .json({ error: "Expiry must be between 1 and 720 hours" });
  }
  try {
    if (await require("../models/user.model").findByEmail(email)) {
      return res
        .status(409)
        .json({ error: "That user already has an account" });
    }
    const expiresAt = new Date(Date.now() + expiresHours * 60 * 60 * 1000);
    const { token, invitation } = await invitationModel.create({
      email,
      role,
      invitedBy: req.user.id,
      expiresAt,
    });
    const baseUrl = (
      process.env.APP_BASE_URL || `${req.protocol}://${req.get("host")}`
    ).replace(/\/$/, "");
    const inviteUrl = `${baseUrl}/#invite=${encodeURIComponent(token)}`;
    let emailSent = false;
    if (process.env.RESEND_API_KEY && process.env.INVITE_FROM_EMAIL) {
      const emailResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: process.env.INVITE_FROM_EMAIL,
          to: [email],
          subject: "You are invited to Moonlit",
          text: `You have been invited to Moonlit as ${role}. Accept before ${expiresAt.toISOString()}: ${inviteUrl}`,
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (!emailResponse.ok) {
        return res.status(502).json({
          error: "Invitation was created, but email delivery failed",
          invitation,
          inviteUrl,
        });
      }
      emailSent = true;
    }
    return res.status(201).json({ invitation, inviteUrl, emailSent });
  } catch (error) {
    return next(error);
  }
});

router.delete("/invites/:id", async (req, res, next) => {
  try {
    const revoked = await invitationModel.revoke(req.params.id);
    return revoked
      ? res.status(204).end()
      : res.status(404).json({ error: "Invitation not found" });
  } catch (error) {
    return next(error);
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

router.get("/analytics", async (_req, res, next) => {
  try {
    let conversations;
    let conversationTotals;
    let popularIntents;
    let feedback;
    let failures;
    if (pool) {
      [conversations, conversationTotals, popularIntents, feedback, failures] =
        await Promise.all([
          pool.query(
            `SELECT COUNT(*)::int AS total, created_at::date::text AS day
           FROM conversations
           WHERE created_at >= NOW() - INTERVAL '6 days'
           GROUP BY created_at::date ORDER BY day`,
          ),
          pool.query(
            `SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int AS last_week
           FROM conversations`,
          ),
          pool.query(
            `SELECT intent, COUNT(*)::int AS count
             FROM conversations
             GROUP BY intent
             ORDER BY count DESC, intent ASC
             LIMIT 5`,
          ),
          pool.query(
            `SELECT rating, COUNT(*)::int AS count
           FROM conversation_feedback GROUP BY rating`,
          ),
          pool.query(
            `SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int AS last_week
           FROM failed_queries`,
          ),
        ]);
    } else {
      [conversations, feedback, failures] = await Promise.all([
        conversationModel.list({ limit: 5000 }),
        feedbackModel.list({ limit: 5000 }),
        failedQueryModel.list({ limit: 5000 }),
      ]);
    }

    const since = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const usageByDay = Array.from({ length: 7 }, (_, offset) => {
      const date = new Date();
      date.setUTCHours(0, 0, 0, 0);
      date.setUTCDate(date.getUTCDate() - (6 - offset));
      const day = date.toISOString().slice(0, 10);
      const count = pool
        ? Number(conversations.rows.find((row) => row.day === day)?.total || 0)
        : conversations.filter((item) => item.createdAt.slice(0, 10) === day)
            .length;
      return { day, count };
    });
    const feedbackCounts = pool
      ? Object.fromEntries(feedback.rows.map((row) => [row.rating, row.count]))
      : feedback.reduce((counts, item) => {
          counts[item.rating] = (counts[item.rating] || 0) + 1;
          return counts;
        }, {});
    const topIntents = pool
      ? popularIntents.rows.map((row) => ({
          intent: row.intent,
          count: row.count,
        }))
      : Object.entries(
          conversations.reduce((counts, item) => {
            counts[item.intent] = (counts[item.intent] || 0) + 1;
            return counts;
          }, {}),
        )
          .map(([intent, count]) => ({ intent, count }))
          .sort((first, second) => second.count - first.count)
          .slice(0, 5);
    const conversationTotal = pool
      ? Number(conversationTotals.rows[0]?.total || 0)
      : conversations.length;
    const failureTotal = pool
      ? Number(failures.rows[0]?.total || 0)
      : failures.length;
    const weekConversations = pool
      ? Number(conversationTotals.rows[0]?.last_week || 0)
      : conversations.filter((item) => Date.parse(item.createdAt) >= since)
          .length;
    const weekFailures = pool
      ? Number(failures.rows[0]?.last_week || 0)
      : failures.filter((item) => Date.parse(item.createdAt) >= since).length;

    return res.json({
      conversations: conversationTotal,
      conversationsLastWeek: weekConversations,
      feedback: feedbackCounts,
      failures: failureTotal,
      failuresLastWeek: weekFailures,
      usageByDay,
      topIntents,
      performance: analyticsService.performanceSummary(),
    });
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
