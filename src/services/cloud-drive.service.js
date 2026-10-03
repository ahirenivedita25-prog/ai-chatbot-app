const crypto = require("node:crypto");
const jwt = require("jsonwebtoken");
const integrationTokenModel = require("../models/integration-token.model");

const allowedProviders = new Set(["google", "microsoft"]);
const maxFileBytes = 1024 * 1024;

function providerConfig(provider) {
  if (provider === "google") {
    return {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      scope: "https://www.googleapis.com/auth/drive.readonly",
    };
  }
  if (provider === "microsoft") {
    return {
      clientId: process.env.MICROSOFT_CLIENT_ID,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
      authorizeUrl:
        "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
      tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
      scope: "offline_access Files.Read User.Read",
    };
  }
  throw new Error("Unsupported cloud provider");
}

function callbackUrl(provider, appBaseUrl) {
  return new URL(
    `/api/integrations/${provider}/callback`,
    appBaseUrl,
  ).toString();
}

function assertConfigured(provider) {
  const config = providerConfig(provider);
  if (!config.clientId || !config.clientSecret) {
    throw new Error(`${provider} OAuth is not configured`);
  }
  if (!process.env.JWT_SECRET)
    throw new Error("Authentication is not configured");
  return config;
}

function createAuthorizationUrl(provider, userId, appBaseUrl) {
  const config = assertConfigured(provider);
  const nonce = crypto.randomBytes(32).toString("base64url");
  const state = jwt.sign(
    { sub: userId, provider, nonce },
    process.env.JWT_SECRET,
    { expiresIn: "10m", algorithm: "HS256" },
  );
  const url = new URL(config.authorizeUrl);
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: callbackUrl(provider, appBaseUrl),
    response_type: "code",
    scope: config.scope,
    state,
    ...(provider === "google"
      ? { access_type: "offline", prompt: "consent" }
      : { response_mode: "query" }),
  });
  return { authorizationUrl: url.toString(), nonce };
}

function validateState(provider, state, nonce) {
  if (typeof state !== "string" || typeof nonce !== "string") {
    throw new Error("OAuth state is missing");
  }
  const payload = jwt.verify(state, process.env.JWT_SECRET, {
    algorithms: ["HS256"],
  });
  const receivedNonce = Buffer.from(payload.nonce || "");
  const expectedNonce = Buffer.from(nonce);
  if (
    payload.provider !== provider ||
    !payload.sub ||
    receivedNonce.length !== expectedNonce.length ||
    !crypto.timingSafeEqual(receivedNonce, expectedNonce)
  ) {
    throw new Error("OAuth state is invalid");
  }
  return payload.sub;
}

async function postForm(url, values) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(values),
    signal: AbortSignal.timeout(10000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) {
    throw new Error("Cloud drive authorization failed");
  }
  return body;
}

async function completeAuthorization({
  provider,
  code,
  state,
  nonce,
  appBaseUrl,
}) {
  const userId = validateState(provider, state, nonce);
  const config = assertConfigured(provider);
  const body = await postForm(config.tokenUrl, {
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    redirect_uri: callbackUrl(provider, appBaseUrl),
    grant_type: "authorization_code",
  });
  await integrationTokenModel.save(userId, provider, {
    accessToken: body.access_token,
    refreshToken: body.refresh_token || null,
    expiresAt: Date.now() + Number(body.expires_in || 3600) * 1000,
  });
  return userId;
}

async function getAccessToken(userId, provider) {
  const tokens = await integrationTokenModel.find(userId, provider);
  if (!tokens) throw new Error("Connect this cloud drive first");
  if (tokens.expiresAt > Date.now() + 60000) return tokens.accessToken;
  if (!tokens.refreshToken) throw new Error("Reconnect this cloud drive");
  const config = assertConfigured(provider);
  const body = await postForm(config.tokenUrl, {
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: tokens.refreshToken,
    grant_type: "refresh_token",
    ...(provider === "microsoft" ? { scope: config.scope } : {}),
  });
  await integrationTokenModel.save(userId, provider, {
    accessToken: body.access_token,
    refreshToken: body.refresh_token || tokens.refreshToken,
    expiresAt: Date.now() + Number(body.expires_in || 3600) * 1000,
  });
  return body.access_token;
}

function fileType(file) {
  const extension = String(file.name || "")
    .split(".")
    .pop()
    .toLowerCase();
  const byExtension = {
    txt: "text/plain",
    md: "text/markdown",
    csv: "text/csv",
    json: "application/json",
  };
  if (byExtension[extension]) return byExtension[extension];
  if (file.mimeType === "application/vnd.google-apps.document")
    return "text/plain";
  if (file.mimeType === "application/vnd.google-apps.spreadsheet")
    return "text/csv";
  return "";
}

async function cloudRequest(url, token) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("Cloud drive request failed");
  return response;
}

async function listFiles(userId, provider, rawQuery = "") {
  if (!allowedProviders.has(provider))
    throw new Error("Unsupported cloud provider");
  const token = await getAccessToken(userId, provider);
  const query =
    typeof rawQuery === "string" ? rawQuery.trim().slice(0, 120) : "";
  if (provider === "google") {
    const url = new URL("https://www.googleapis.com/drive/v3/files");
    const supported = [
      "text/plain",
      "text/markdown",
      "text/csv",
      "application/json",
      "application/vnd.google-apps.document",
      "application/vnd.google-apps.spreadsheet",
    ];
    const clauses = [
      "trashed = false",
      `(${supported.map((type) => `mimeType = '${type}'`).join(" or ")})`,
    ];
    if (query) clauses.push(`name contains '${query.replace(/'/g, "\\'")}'`);
    url.search = new URLSearchParams({
      q: clauses.join(" and "),
      pageSize: "50",
      orderBy: "modifiedTime desc",
      fields: "files(id,name,mimeType,modifiedTime,size)",
    });
    const response = await cloudRequest(url, token);
    const body = await response.json();
    return (body.files || [])
      .filter((file) => fileType(file))
      .map((file) => ({
        id: file.id,
        name: file.name,
        type: fileType(file),
        modifiedAt: file.modifiedTime || null,
        size: Number(file.size || 0),
      }));
  }
  const endpoint = query
    ? `https://graph.microsoft.com/v1.0/me/drive/root/search(q='${query.replace(/'/g, "''")}')`
    : "https://graph.microsoft.com/v1.0/me/drive/root/children";
  const url = new URL(endpoint);
  url.search = new URLSearchParams({
    $top: "50",
    $select: "id,name,file,lastModifiedDateTime,size",
  });
  const response = await cloudRequest(url, token);
  const body = await response.json();
  return (body.value || [])
    .filter((file) =>
      fileType({ name: file.name, mimeType: file.file?.mimeType }),
    )
    .map((file) => ({
      id: file.id,
      name: file.name,
      type: fileType({ name: file.name, mimeType: file.file?.mimeType }),
      modifiedAt: file.lastModifiedDateTime || null,
      size: Number(file.size || 0),
    }));
}

async function importFile(userId, provider, fileId) {
  if (!allowedProviders.has(provider))
    throw new Error("Unsupported cloud provider");
  if (typeof fileId !== "string" || !fileId || fileId.length > 512) {
    throw new Error("Invalid cloud file ID");
  }
  const token = await getAccessToken(userId, provider);
  let metadata;
  let downloadUrl;
  if (provider === "google") {
    const metadataUrl = new URL(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`,
    );
    metadataUrl.search = new URLSearchParams({
      fields: "id,name,mimeType,size",
    });
    const metadataResponse = await cloudRequest(metadataUrl, token);
    metadata = await metadataResponse.json();
    const type = fileType(metadata);
    if (!type)
      throw new Error(
        "Only text, Markdown, CSV, and JSON files can be imported",
      );
    if (Number(metadata.size || 0) > maxFileBytes)
      throw new Error("Cloud file exceeds the 1 MB import limit");
    downloadUrl = metadata.mimeType.startsWith("application/vnd.google-apps.")
      ? new URL(
          `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent(type)}`,
        )
      : new URL(
          `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
        );
  } else {
    const metadataUrl = new URL(
      `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(fileId)}`,
    );
    metadataUrl.search = new URLSearchParams({ $select: "id,name,file,size" });
    const metadataResponse = await cloudRequest(metadataUrl, token);
    metadata = await metadataResponse.json();
    const type = fileType({
      name: metadata.name,
      mimeType: metadata.file?.mimeType,
    });
    if (!type)
      throw new Error(
        "Only text, Markdown, CSV, and JSON files can be imported",
      );
    if (Number(metadata.size || 0) > maxFileBytes)
      throw new Error("Cloud file exceeds the 1 MB import limit");
    downloadUrl = new URL(
      `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(fileId)}/content`,
    );
  }
  const contentResponse = await cloudRequest(downloadUrl, token);
  const content = await contentResponse.text();
  if (Buffer.byteLength(content, "utf8") > maxFileBytes) {
    throw new Error("Cloud file exceeds the 1 MB import limit");
  }
  return {
    name: String(metadata.name || "Imported file").slice(0, 160),
    type: fileType(
      metadata.name
        ? metadata
        : { name: metadata.name, mimeType: metadata.file?.mimeType },
    ),
    text: content.slice(0, 30000),
  };
}

module.exports = {
  createAuthorizationUrl,
  completeAuthorization,
  listFiles,
  importFile,
  allowedProviders,
};
