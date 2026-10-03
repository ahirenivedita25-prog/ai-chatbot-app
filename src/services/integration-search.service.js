const timeoutMs = 10000;

function plainText(value, limit = 1200) {
  if (typeof value === "string")
    return value.replace(/\s+/g, " ").trim().slice(0, limit);
  if (Array.isArray(value))
    return value
      .map((item) => plainText(item, limit))
      .filter(Boolean)
      .join(" ")
      .slice(0, limit);
  if (value && typeof value === "object") {
    if (typeof value.text === "string") return plainText(value.text, limit);
    return Object.values(value)
      .map((item) => plainText(item, limit))
      .filter(Boolean)
      .join(" ")
      .slice(0, limit);
  }
  return "";
}

function configured(provider) {
  if (provider === "jira") {
    return Boolean(
      process.env.JIRA_BASE_URL &&
      process.env.JIRA_EMAIL &&
      process.env.JIRA_API_TOKEN,
    );
  }
  if (provider === "confluence") {
    return Boolean(
      process.env.CONFLUENCE_BASE_URL &&
      process.env.CONFLUENCE_EMAIL &&
      process.env.CONFLUENCE_API_TOKEN,
    );
  }
  return provider === "slack" && Boolean(process.env.SLACK_BOT_TOKEN);
}

function httpUrl(value, base) {
  if (typeof value !== "string" || !value) return "";
  try {
    const url = new URL(value, base);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : "";
  } catch {
    return "";
  }
}

async function requestJson(url, options, provider) {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`${provider} search request failed`);
  return response.json();
}

function basicAuth(email, token) {
  return `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`;
}

async function searchJira(query) {
  const base = new URL(process.env.JIRA_BASE_URL);
  base.pathname = `${base.pathname.replace(/\/$/, "")}/rest/api/3/search`;
  const escaped = query.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  base.search = new URLSearchParams({
    jql: `text ~ "${escaped}" ORDER BY updated DESC`,
    maxResults: "10",
    fields: "summary,description,status,updated",
  });
  const body = await requestJson(
    base,
    {
      headers: {
        Authorization: basicAuth(
          process.env.JIRA_EMAIL,
          process.env.JIRA_API_TOKEN,
        ),
        Accept: "application/json",
      },
    },
    "Jira",
  );
  return (body.issues || []).map((issue) => ({
    id: issue.key,
    title: `${issue.key}: ${issue.fields?.summary || "Untitled issue"}`,
    excerpt: plainText(issue.fields?.description),
    updatedAt: issue.fields?.updated || null,
    url: httpUrl(
      `/browse/${encodeURIComponent(issue.key)}`,
      process.env.JIRA_BASE_URL,
    ),
  }));
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1200);
}

async function searchConfluence(query) {
  const base = new URL(process.env.CONFLUENCE_BASE_URL);
  base.pathname = `${base.pathname.replace(/\/$/, "")}/wiki/rest/api/search`;
  const escaped = query.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  base.search = new URLSearchParams({
    cql: `text ~ "${escaped}"`,
    limit: "10",
    expand: "content.body.storage",
  });
  const body = await requestJson(
    base,
    {
      headers: {
        Authorization: basicAuth(
          process.env.CONFLUENCE_EMAIL,
          process.env.CONFLUENCE_API_TOKEN,
        ),
        Accept: "application/json",
      },
    },
    "Confluence",
  );
  return (body.results || []).map((result) => ({
    id: String(result.content?.id || result.id || ""),
    title: result.title || result.content?.title || "Untitled page",
    excerpt: stripHtml(result.excerpt || result.content?.body?.storage?.value),
    updatedAt: result.lastModified || null,
    url: httpUrl(
      result.url || result._links?.webui,
      process.env.CONFLUENCE_BASE_URL,
    ),
  }));
}

async function searchSlack(query) {
  if (!/^xox[baprs]-/.test(process.env.SLACK_BOT_TOKEN)) {
    throw new Error("Slack token is not a supported bot token");
  }
  const url = new URL("https://slack.com/api/search.messages");
  url.search = new URLSearchParams({
    query,
    count: "10",
    sort: "timestamp",
    sort_dir: "desc",
  });
  const body = await requestJson(
    url,
    { headers: { Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}` } },
    "Slack",
  );
  if (!body.ok) throw new Error("Slack search request failed");
  return (body.messages?.matches || []).map((message) => ({
    id: String(message.ts || ""),
    title: `#${message.channel?.name || "channel"} · ${message.username || "Slack message"}`,
    excerpt: plainText(message.text),
    updatedAt: message.ts
      ? new Date(Number(message.ts) * 1000).toISOString()
      : null,
    url: httpUrl(message.permalink),
  }));
}

async function searchIntegration(provider, rawQuery) {
  const query =
    typeof rawQuery === "string" ? rawQuery.trim().slice(0, 200) : "";
  if (!query) throw new Error("Enter a search query");
  if (!configured(provider)) throw new Error(`${provider} is not configured`);
  if (provider === "jira") return searchJira(query);
  if (provider === "confluence") return searchConfluence(query);
  if (provider === "slack") return searchSlack(query);
  throw new Error("Unsupported integration");
}

module.exports = { searchIntegration, configured, plainText };
