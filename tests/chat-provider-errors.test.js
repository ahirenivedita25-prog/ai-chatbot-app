const test = require("node:test");
const assert = require("node:assert/strict");

process.env.JWT_SECRET = "provider-error-test-secret-at-least-32-bytes";
process.env.AI_API_KEY = "test-provider-key";
process.env.AI_API_URL = "https://provider.test/chat/completions";
const jwt = require("jsonwebtoken");
const userModel = require("../src/models/user.model");
const app = require("../src/app");

const user = userModel.create({
  email: "provider-error@test.local",
  passwordHash: "test",
  role: "editor",
});
const authToken = jwt.sign(
  { sub: user.id, email: user.email },
  process.env.JWT_SECRET,
);

async function withServer(run) {
  const server = app.listen(0);
  try {
    await new Promise((resolve) => server.once("listening", resolve));
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function sendChat(url) {
  return fetch(`${url}/api/school/chat`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${authToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ message: "Share the addition code" }),
  });
}

test("provider authentication rejection returns a diagnostic 502, not generic 500", async () => {
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    if (url === process.env.AI_API_URL) {
      assert.equal(options.method, "POST");
      return new Response(
        JSON.stringify({ error: { message: "Invalid provider credential" } }),
        { status: 401, headers: { "content-type": "application/json" } },
      );
    }
    return originalFetch(url, options);
  };

  try {
    await withServer(async (url) => {
      const response = await sendChat(url);
      const result = await response.json();
      assert.equal(response.status, 502);
      assert.match(result.error, /AI_API_KEY and AI_API_URL/);
      assert.notEqual(result.error, "Internal server error");
    });
  } finally {
    global.fetch = originalFetch;
  }
});

test("provider network failures return a retryable diagnostic 502", async () => {
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    if (url === process.env.AI_API_URL)
      throw new TypeError("connection refused");
    return originalFetch(url, options);
  };

  try {
    await withServer(async (url) => {
      const response = await sendChat(url);
      const result = await response.json();
      assert.equal(response.status, 502);
      assert.match(result.error, /temporarily unavailable/);
    });
  } finally {
    global.fetch = originalFetch;
  }
});
