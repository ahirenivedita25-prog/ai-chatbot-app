const express = require("express");
const { validateMessage } = require("../utils/validator");
const analytics = require("../services/analytics.service");
const { generateReply } = require("../services/chatbot.service");

const router = express.Router();

router.post("/chat", async (req, res) => {
  const validation = validateMessage(req.body);
  if (!validation.valid)
    return res.status(400).json({ error: validation.error });

  analytics.track("chat_message", { industry: "school" });
  try {
    return res.json({
      industry: "school",
      reply: await generateReply({
        industry: "school",
        message: req.body.message.trim(),
      }),
    });
  } catch (error) {
    return res
      .status(502)
      .json({ error: "The AI service is temporarily unavailable" });
  }
});

module.exports = router;
