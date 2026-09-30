const express = require("express");
const conversationModel = require("../models/conversation.model");

const router = express.Router();

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
