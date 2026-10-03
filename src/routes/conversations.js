const express = require("express");
const conversationModel = require("../models/conversation.model");
const feedbackModel = require("../models/feedback.model");

const router = express.Router();
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

router.post("/:conversationId/feedback", async (req, res, next) => {
  const { rating } = req.body || {};
  if (!["helpful", "not_helpful"].includes(rating)) {
    return res
      .status(400)
      .json({ error: "rating must be helpful or not_helpful" });
  }
  try {
    const ownsConversation = await conversationModel.existsForUser(
      req.params.conversationId,
      req.user.id,
    );
    if (!ownsConversation)
      return res.status(404).json({ error: "Conversation not found" });
    const feedback = await feedbackModel.create({
      conversationId: req.params.conversationId,
      userId: req.user.id,
      rating,
    });
    return res.status(201).json({ feedback });
  } catch (error) {
    return next(error);
  }
});

router.get("/", async (req, res, next) => {
  try {
    const conversations = await conversationModel.listForUser(req.user.id, {
      limit: 100,
    });
    return res.json({ conversations });
  } catch (error) {
    return next(error);
  }
});

router.get("/threads", async (req, res, next) => {
  try {
    const threads = await conversationModel.listThreadsForUser(req.user.id, {
      limit: 500,
      search:
        typeof req.query.search === "string"
          ? req.query.search.slice(0, 160)
          : "",
      industry:
        typeof req.query.industry === "string" ? req.query.industry : "",
    });
    const conversationIds = threads.flatMap((thread) =>
      thread.messages
        .filter((message) => message.role === "assistant")
        .map((message) => message.conversationId),
    );
    const feedback = await feedbackModel.listForConversations(
      req.user.id,
      conversationIds,
    );
    const ratingsByConversation = new Map(
      feedback.map((item) => [item.conversationId, item.rating]),
    );
    for (const thread of threads) {
      for (const message of thread.messages) {
        if (message.role === "assistant") {
          message.feedback = ratingsByConversation.get(message.conversationId);
        }
      }
    }
    return res.json({ threads });
  } catch (error) {
    return next(error);
  }
});

router.patch("/threads/:threadId", async (req, res, next) => {
  if (!uuidPattern.test(req.params.threadId)) {
    return res.status(400).json({ error: "Invalid thread ID" });
  }
  const label =
    typeof req.body?.label === "string" ? req.body.label.trim() : "";
  if (label.length > 120)
    return res
      .status(400)
      .json({ error: "Label must be at most 120 characters" });
  try {
    const updated = await conversationModel.setThreadLabel(
      req.user.id,
      req.params.threadId,
      label || null,
    );
    return updated
      ? res.json({ ok: true })
      : res.status(404).json({ error: "Thread not found" });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
