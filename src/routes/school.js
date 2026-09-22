const express = require("express");
const { validateMessage } = require("../utils/validator");
const analytics = require("../services/analytics.service");

const router = express.Router();

router.post("/chat", (req, res) => {
  const validation = validateMessage(req.body);
  if (!validation.valid)
    return res.status(400).json({ error: validation.error });

  analytics.track("chat_message", { industry: "school" });
  return res.json({
    industry: "school",
    reply:
      "School support is ready to help with fees, schedules, and admissions.",
  });
});

module.exports = router;
