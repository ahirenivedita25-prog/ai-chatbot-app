const express = require("express");
const { validateMessage } = require("../utils/validator");
const { answerMessage } = require("../services/chat.service");
const { requireAnyRole } = require("../middleware/auth");

function createChatRouter(industry) {
  const router = express.Router();
  router.post(
    "/chat",
    requireAnyRole("admin", "editor", "user"),
    async (req, res, next) => {
      const validation = validateMessage(req.body);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }

      try {
        const result = await answerMessage({
          userId: req.user.id,
          industry,
          message: req.body.message,
          attachments: req.body.attachments || [],
          threadId: req.body.threadId,
          label: req.body.label,
        });
        return res.json(result);
      } catch (error) {
        if (
          /^Weather API request failed|^Weather API returned an invalid response/i.test(
            error.message,
          )
        ) {
          return res.status(502).json({
            error:
              "Weather lookup is temporarily unavailable. Check the city name or try again shortly.",
          });
        }
        if (error.message === "Malware detected") {
          return res
            .status(422)
            .json({ error: "An attachment failed the malware scan" });
        }
        if (
          error.message === "Malware scanner unavailable" ||
          error.message === "Malware scan timed out" ||
          error.message === "Malware scanner returned an invalid response" ||
          error.message === "Malware scanner is required before file processing"
        ) {
          return res
            .status(503)
            .json({ error: "File scanning is temporarily unavailable" });
        }
        return next(error);
      }
    },
  );
  return router;
}

function createPlainChatRouter() {
  const router = express.Router();
  router.post(
    "/",
    requireAnyRole("admin", "editor", "user"),
    async (req, res, next) => {
      const validation = validateMessage(req.body);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }

      const industry = req.body.industry || "school";
      if (!["school", "clinic", "retail", "restaurant"].includes(industry)) {
        return res.status(400).json({ error: "Unsupported industry" });
      }

      try {
        const result = await answerMessage({
          userId: req.user.id,
          industry,
          message: req.body.message,
          attachments: req.body.attachments || [],
          threadId: req.body.threadId,
          label: req.body.label,
        });
        // Keep this compatibility endpoint's successful response as plain text.
        return res.type("text/plain; charset=utf-8").send(result.reply);
      } catch (error) {
        if (
          /^Weather API request failed|^Weather API returned an invalid response/i.test(
            error.message,
          )
        ) {
          return res.status(502).json({
            error:
              "Weather lookup is temporarily unavailable. Check the city name or try again shortly.",
          });
        }
        if (error.message === "Malware detected") {
          return res
            .status(422)
            .json({ error: "An attachment failed the malware scan" });
        }
        if (error.message.startsWith("Malware scanner")) {
          return res
            .status(503)
            .json({ error: "File scanning is temporarily unavailable" });
        }
        return next(error);
      }
    },
  );
  return router;
}

module.exports = { createChatRouter, createPlainChatRouter };
