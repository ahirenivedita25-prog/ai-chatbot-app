const express = require("express");
const serviceRequestModel = require("../models/service-request.model");
const userModel = require("../models/user.model");
const { requireAdmin } = require("../middleware/auth");

const router = express.Router();
const categories = new Set([
  "hotel",
  "appointment",
  "shopping",
  "payment",
  "banking",
]);
const statuses = new Set(["received", "in_review", "closed"]);
const sensitiveDetails =
  /\b(?:password|passcode|passphrase|pin|cvv|cvc|otp|one[- ]time (?:password|code)|security code)\b|\b(?:card|account|routing|iban|sort code)\s*(?:number|no\.?)\s*[:#-]?\s*[\d -]{6,}/i;

router.post("/", async (req, res, next) => {
  const { category, details } = req.body || {};
  if (!categories.has(category)) {
    return res.status(400).json({ error: "Choose a supported request type" });
  }
  if (typeof details !== "string" || !details.trim() || details.length > 2000) {
    return res
      .status(400)
      .json({ error: "Request details must be 1 to 2000 characters" });
  }
  const normalizedDetails = details.trim();
  const digitCount = normalizedDetails.replace(/\D/g, "").length;
  if (
    sensitiveDetails.test(normalizedDetails) ||
    (digitCount >= 13 && digitCount <= 19)
  ) {
    return res.status(400).json({
      error:
        "Do not include passwords, PINs, verification codes, card numbers, or bank account numbers.",
    });
  }

  try {
    const serviceRequest = await serviceRequestModel.create({
      userId: req.user.id,
      category,
      details: normalizedDetails,
    });
    return res.status(201).json({ request: serviceRequest });
  } catch (error) {
    return next(error);
  }
});

router.get("/", async (req, res, next) => {
  try {
    const requests = await serviceRequestModel.list({
      userId: req.user.role === "admin" ? undefined : req.user.id,
      limit: 200,
    });
    if (req.user.role === "admin") {
      await Promise.all(
        requests.map(async (serviceRequest) => {
          const requester = await userModel.findById(serviceRequest.userId);
          serviceRequest.requesterEmail = requester?.email || "Unknown user";
        }),
      );
    }
    return res.json({ requests });
  } catch (error) {
    return next(error);
  }
});

router.patch("/:requestId", requireAdmin, async (req, res, next) => {
  const { status } = req.body || {};
  if (!statuses.has(status)) {
    return res.status(400).json({ error: "Choose a supported request status" });
  }
  try {
    const serviceRequest = await serviceRequestModel.updateStatus(
      req.params.requestId,
      status,
    );
    return serviceRequest
      ? res.json({ request: serviceRequest })
      : res.status(404).json({ error: "Request not found" });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
