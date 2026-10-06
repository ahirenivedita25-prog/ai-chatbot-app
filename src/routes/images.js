const express = require("express");
const auditModel = require("../models/audit.model");
const { requireAnyRole } = require("../middleware/auth");
const { enhanceImage, styles } = require("../services/image-enhance.service");

const router = express.Router();

router.post(
  "/enhance",
  requireAnyRole("admin", "editor"),
  async (req, res, next) => {
    try {
      const { image, style } = req.body || {};
      if (!styles.includes(style)) {
        return res
          .status(400)
          .json({ error: "Choose a supported image enhancement style" });
      }
      const enhancedImage = await enhanceImage({ image, style });
      await auditModel.create({
        userId: req.user.id,
        action: `image.enhance.${style}`,
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      });
      return res.json({ image: enhancedImage, style });
    } catch (error) {
      if (error.status)
        return res.status(error.status).json({ error: error.message });
      return next(error);
    }
  },
);

module.exports = router;
