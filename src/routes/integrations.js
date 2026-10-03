const express = require("express");
const { requireAuth, requireAnyRole } = require("../middleware/auth");
const { recordUserActivity } = require("../middleware/activity-audit");
const integrationTokenModel = require("../models/integration-token.model");
const {
  configured,
  searchIntegration,
} = require("../services/integration-search.service");
const cloudDriveService = require("../services/cloud-drive.service");

const router = express.Router();

function appBaseUrl(req) {
  return (
    process.env.APP_BASE_URL || `${req.protocol}://${req.get("host")}`
  ).replace(/\/$/, "");
}

function getCookie(req, name) {
  const part = (req.get("cookie") || "")
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${name}=`));
  return part ? decodeURIComponent(part.slice(name.length + 1)) : "";
}

function clearStateCookie(res, provider) {
  res.clearCookie(`moonlit_oauth_${provider}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: `/api/integrations/${provider}/callback`,
  });
}

function failureStatus(error) {
  if (
    /not configured|connect this cloud drive|reconnect this cloud drive/i.test(
      error.message,
    )
  )
    return 503;
  if (/query|file ID|only text|1 MB|unsupported/i.test(error.message))
    return 400;
  return 502;
}

router.get("/:provider/callback", async (req, res) => {
  const { provider } = req.params;
  const baseUrl = appBaseUrl(req);
  if (!cloudDriveService.allowedProviders.has(provider)) {
    return res.redirect(`${baseUrl}/?integration_error=unsupported`);
  }
  clearStateCookie(res, provider);
  try {
    if (req.query.error || typeof req.query.code !== "string") {
      throw new Error("Cloud drive authorization failed");
    }
    await cloudDriveService.completeAuthorization({
      provider,
      code: req.query.code,
      state: req.query.state,
      nonce: getCookie(req, `moonlit_oauth_${provider}`),
      appBaseUrl: baseUrl,
    });
    return res.redirect(`${baseUrl}/?connected=${provider}`);
  } catch {
    return res.redirect(`${baseUrl}/?integration_error=${provider}`);
  }
});

router.use(requireAuth);
router.use(recordUserActivity);
router.use(requireAnyRole("admin", "editor"));

router.get("/status", async (req, res, next) => {
  try {
    return res.json({
      integrations: {
        jira: { configured: configured("jira") },
        confluence: { configured: configured("confluence") },
        slack: { configured: configured("slack") },
        google: {
          configured: Boolean(
            process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
          ),
          connected: Boolean(
            await integrationTokenModel.find(req.user.id, "google"),
          ),
        },
        microsoft: {
          configured: Boolean(
            process.env.MICROSOFT_CLIENT_ID &&
            process.env.MICROSOFT_CLIENT_SECRET,
          ),
          connected: Boolean(
            await integrationTokenModel.find(req.user.id, "microsoft"),
          ),
        },
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/:provider/connect", (req, res) => {
  const { provider } = req.params;
  try {
    const { authorizationUrl, nonce } =
      cloudDriveService.createAuthorizationUrl(
        provider,
        req.user.id,
        appBaseUrl(req),
      );
    res.cookie(`moonlit_oauth_${provider}`, nonce, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: `/api/integrations/${provider}/callback`,
      maxAge: 10 * 60 * 1000,
    });
    return res.json({ authorizationUrl });
  } catch (error) {
    return res.status(failureStatus(error)).json({ error: error.message });
  }
});

router.post("/:provider/search", async (req, res) => {
  try {
    const results = await searchIntegration(
      req.params.provider,
      req.body?.query,
    );
    return res.json({ provider: req.params.provider, results });
  } catch (error) {
    return res.status(failureStatus(error)).json({ error: error.message });
  }
});

router.get("/:provider/files", async (req, res) => {
  try {
    const files = await cloudDriveService.listFiles(
      req.user.id,
      req.params.provider,
      req.query.q,
    );
    return res.json({ files });
  } catch (error) {
    return res.status(failureStatus(error)).json({ error: error.message });
  }
});

router.get("/:provider/files/:fileId", async (req, res) => {
  try {
    const file = await cloudDriveService.importFile(
      req.user.id,
      req.params.provider,
      req.params.fileId,
    );
    return res.json({ file });
  } catch (error) {
    return res.status(failureStatus(error)).json({ error: error.message });
  }
});

module.exports = router;
