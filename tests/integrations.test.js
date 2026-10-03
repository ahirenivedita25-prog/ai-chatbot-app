const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "integration-test-secret-at-least-32-bytes-long";
const app = require("../src/app");
const userModel = require("../src/models/user.model");
const integrationTokenModel = require("../src/models/integration-token.model");

async function withServer(run) {
  const server = app.listen(0);
  try {
    await new Promise((resolve) => server.once("listening", resolve));
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function tokenFor(user) {
  return jwt.sign({ sub: user.id }, process.env.JWT_SECRET, {
    algorithm: "HS256",
  });
}

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => String(body),
  };
}

test("Slack integration searches configured workspace messages", async () => {
  const originalFetch = global.fetch;
  const originalToken = process.env.SLACK_BOT_TOKEN;
  process.env.SLACK_BOT_TOKEN = "xoxb-test-token";
  const user = userModel.create({
    email: "integration-slack@test.local",
    passwordHash: "hash",
    role: "editor",
  });
  global.fetch = async (input, options) => {
    const url = new URL(input);
    if (url.hostname === "127.0.0.1") return originalFetch(input, options);
    assert.equal(url.pathname, "/api/search.messages");
    assert.equal(url.searchParams.get("query"), "release plan");
    return response({
      ok: true,
      messages: {
        matches: [
          {
            ts: "1791000000.000001",
            channel: { name: "product" },
            username: "Mina",
            text: "Release review is Friday.",
            permalink: "https://slack.test/message/1",
          },
        ],
      },
    });
  };

  try {
    await withServer(async (baseUrl) => {
      const result = await fetch(`${baseUrl}/api/integrations/slack/search`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenFor(user)}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: "release plan" }),
      });
      const body = await result.json();
      assert.equal(result.status, 200);
      assert.equal(body.results[0].title, "#product · Mina");
      assert.equal(body.results[0].excerpt, "Release review is Friday.");
    });
  } finally {
    global.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.SLACK_BOT_TOKEN;
    else process.env.SLACK_BOT_TOKEN = originalToken;
  }
});

test("Jira and Confluence integrations return normalized search results", async () => {
  const originalFetch = global.fetch;
  const oldEnvironment = {
    JIRA_BASE_URL: process.env.JIRA_BASE_URL,
    JIRA_EMAIL: process.env.JIRA_EMAIL,
    JIRA_API_TOKEN: process.env.JIRA_API_TOKEN,
    CONFLUENCE_BASE_URL: process.env.CONFLUENCE_BASE_URL,
    CONFLUENCE_EMAIL: process.env.CONFLUENCE_EMAIL,
    CONFLUENCE_API_TOKEN: process.env.CONFLUENCE_API_TOKEN,
  };
  Object.assign(process.env, {
    JIRA_BASE_URL: "https://jira.example.test",
    JIRA_EMAIL: "bot@example.test",
    JIRA_API_TOKEN: "jira-test-token",
    CONFLUENCE_BASE_URL: "https://wiki.example.test",
    CONFLUENCE_EMAIL: "bot@example.test",
    CONFLUENCE_API_TOKEN: "wiki-test-token",
  });
  const user = userModel.create({
    email: "integration-atlassian@test.local",
    passwordHash: "hash",
    role: "admin",
  });
  global.fetch = async (input, options) => {
    const url = new URL(input);
    if (url.hostname === "127.0.0.1") return originalFetch(input, options);
    if (url.hostname === "jira.example.test") {
      assert.match(url.searchParams.get("jql"), /roadmap/);
      return response({
        issues: [
          {
            key: "MOON-14",
            fields: {
              summary: "Roadmap review",
              description: "Planning notes",
              updated: "2026-10-01T10:00:00Z",
            },
          },
        ],
      });
    }
    assert.equal(url.hostname, "wiki.example.test");
    assert.match(url.searchParams.get("cql"), /roadmap/);
    return response({
      results: [
        {
          id: "88",
          title: "Roadmap",
          excerpt: "Quarterly &amp; annual planning",
          _links: { webui: "/wiki/spaces/PLAN/pages/88" },
        },
      ],
    });
  };

  try {
    await withServer(async (baseUrl) => {
      for (const provider of ["jira", "confluence"]) {
        const result = await fetch(
          `${baseUrl}/api/integrations/${provider}/search`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${tokenFor(user)}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ query: "roadmap" }),
          },
        );
        const body = await result.json();
        assert.equal(result.status, 200);
        assert.equal(body.results.length, 1);
        assert.match(body.results[0].title, /Roadmap/);
        assert.match(body.results[0].url, /^https:\/\//);
      }
    });
  } finally {
    global.fetch = originalFetch;
    for (const [key, value] of Object.entries(oldEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("Google Drive OAuth state protects the callback and imports text files", async () => {
  const originalFetch = global.fetch;
  const originalBaseUrl = process.env.APP_BASE_URL;
  const originalClientId = process.env.GOOGLE_CLIENT_ID;
  const originalClientSecret = process.env.GOOGLE_CLIENT_SECRET;
  process.env.GOOGLE_CLIENT_ID = "google-client-id";
  process.env.GOOGLE_CLIENT_SECRET = "google-client-secret";
  const user = userModel.create({
    email: "integration-drive@test.local",
    passwordHash: "hash",
    role: "editor",
  });
  global.fetch = async (input, options) => {
    const url = new URL(input);
    if (url.hostname === "127.0.0.1") return originalFetch(input, options);
    if (url.hostname === "oauth2.googleapis.com") {
      return response({
        access_token: "drive-access",
        refresh_token: "drive-refresh",
        expires_in: 3600,
      });
    }
    if (url.pathname === "/drive/v3/files" && url.searchParams.has("q")) {
      return response({
        files: [
          {
            id: "file-1",
            name: "notes.txt",
            mimeType: "text/plain",
            size: "5",
          },
        ],
      });
    }
    if (
      url.pathname.endsWith("/files/file-1") &&
      url.searchParams.has("fields")
    ) {
      return response({
        id: "file-1",
        name: "notes.txt",
        mimeType: "text/plain",
        size: "5",
      });
    }
    if (
      url.pathname.endsWith("/files/file-1") &&
      url.searchParams.get("alt") === "media"
    ) {
      return response("hello");
    }
    throw new Error(`Unexpected provider request: ${url}`);
  };

  try {
    await withServer(async (baseUrl) => {
      process.env.APP_BASE_URL = baseUrl;
      const headers = { Authorization: `Bearer ${tokenFor(user)}` };
      const connectResponse = await fetch(
        `${baseUrl}/api/integrations/google/connect`,
        { headers },
      );
      const connect = await connectResponse.json();
      const authorizationUrl = new URL(connect.authorizationUrl);
      const state = authorizationUrl.searchParams.get("state");
      const cookie = connectResponse.headers.get("set-cookie").split(";")[0];
      assert.equal(connectResponse.status, 200);
      assert.equal(
        authorizationUrl.searchParams.get("redirect_uri"),
        `${baseUrl}/api/integrations/google/callback`,
      );

      const callback = await fetch(
        `${baseUrl}/api/integrations/google/callback?code=authorization-code&state=${encodeURIComponent(state)}`,
        { headers: { Cookie: cookie }, redirect: "manual" },
      );
      assert.equal(callback.status, 302);
      assert.match(callback.headers.get("location"), /connected=google/);

      const filesResponse = await fetch(
        `${baseUrl}/api/integrations/google/files`,
        { headers },
      );
      const filesBody = await filesResponse.json();
      assert.equal(filesResponse.status, 200);
      assert.equal(filesBody.files[0].name, "notes.txt");

      const importedResponse = await fetch(
        `${baseUrl}/api/integrations/google/files/file-1`,
        { headers },
      );
      const importedBody = await importedResponse.json();
      assert.equal(importedResponse.status, 200);
      assert.deepEqual(importedBody.file, {
        name: "notes.txt",
        type: "text/plain",
        text: "hello",
      });
    });
  } finally {
    global.fetch = originalFetch;
    for (const [key, value] of [
      ["APP_BASE_URL", originalBaseUrl],
      ["GOOGLE_CLIENT_ID", originalClientId],
      ["GOOGLE_CLIENT_SECRET", originalClientSecret],
    ]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("OneDrive lists and imports supported text files for the connected user", async () => {
  const originalFetch = global.fetch;
  const user = userModel.create({
    email: "integration-onedrive@test.local",
    passwordHash: "hash",
    role: "editor",
  });
  await integrationTokenModel.save(user.id, "microsoft", {
    accessToken: "onedrive-access",
    refreshToken: "onedrive-refresh",
    expiresAt: Date.now() + 3600000,
  });
  global.fetch = async (input, options) => {
    const url = new URL(input);
    if (url.hostname === "127.0.0.1") return originalFetch(input, options);
    assert.equal(url.hostname, "graph.microsoft.com");
    if (url.pathname.endsWith("/drive/root/children")) {
      return response({
        value: [
          {
            id: "item-1",
            name: "brief.md",
            file: { mimeType: "text/markdown" },
            size: "5",
          },
        ],
      });
    }
    if (url.pathname.endsWith("/items/item-1/content"))
      return response("hello");
    return response({
      id: "item-1",
      name: "brief.md",
      file: { mimeType: "text/markdown" },
      size: "5",
    });
  };

  try {
    await withServer(async (baseUrl) => {
      const headers = { Authorization: `Bearer ${tokenFor(user)}` };
      const listResponse = await fetch(
        `${baseUrl}/api/integrations/microsoft/files`,
        { headers },
      );
      const listed = await listResponse.json();
      assert.equal(listResponse.status, 200);
      assert.equal(listed.files[0].type, "text/markdown");

      const importResponse = await fetch(
        `${baseUrl}/api/integrations/microsoft/files/item-1`,
        { headers },
      );
      const imported = await importResponse.json();
      assert.equal(importResponse.status, 200);
      assert.deepEqual(imported.file, {
        name: "brief.md",
        type: "text/markdown",
        text: "hello",
      });
    });
  } finally {
    global.fetch = originalFetch;
  }
});
