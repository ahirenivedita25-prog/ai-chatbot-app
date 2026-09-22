const express = require("express");
const { validateMessage } = require("../utils/validator");

const router = express.Router();

router.post("/chat", (req, res) => {
  const validation = validateMessage(req.body);
  if (!validation.valid)
    return res.status(400).json({ error: validation.error });

  return res.json({
    industry: "clinic",
    reply:
      "Clinic support can help with appointments, services, and opening hours.",
  });
});

module.exports = router;
