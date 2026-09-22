const express = require("express");
const { validateMessage } = require("../utils/validator");

const router = express.Router();

router.post("/chat", (req, res) => {
  const validation = validateMessage(req.body);
  if (!validation.valid)
    return res.status(400).json({ error: validation.error });

  return res.json({
    industry: "retail",
    reply:
      "Retail support can help with products, orders, and delivery updates.",
  });
});

module.exports = router;
