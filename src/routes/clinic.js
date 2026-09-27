const express = require("express");
const { validateMessage } = require("../utils/validator");
const { generateReply } = require("../services/chatbot.service");

const router = express.Router();

router.post("/chat", async (req, res) => {
  const validation = validateMessage(req.body);
  if (!validation.valid)
    return res.status(400).json({ error: validation.error });

  try {
    return res.json({
      industry: "clinic",
      reply: await generateReply({
        industry: "clinic",
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
