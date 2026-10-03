const express = require("express");
const conversationModel = require("../models/conversation.model");
const feedbackModel = require("../models/feedback.model");

const router = express.Router();

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

module.exports = router;
