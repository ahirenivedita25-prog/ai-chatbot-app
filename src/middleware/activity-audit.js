const auditModel = require("../models/audit.model");

async function recordUserActivity(req, res, next) {
  try {
    await auditModel.create({
      userId: req.user.id,
      action: `user.${req.method.toLowerCase()}${req.baseUrl}${req.path}`.slice(
        0,
        200,
      ),
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    });
    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = { recordUserActivity };
