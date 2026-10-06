const test = require("node:test");
const assert = require("node:assert/strict");

process.env.JWT_SECRET = "enhancement-test-secret-at-least-32-characters";
process.env.ADMIN_EMAILS = "insights-admin@test.local,image-admin@test.local";
delete process.env.IMAGE_API_URL;
delete process.env.IMAGE_API_KEY;

const app = require("../src/app");

async function withServer(run) {
  const server = app.listen(0);
  try {
    await new Promise((resolve) => server.once("listening", resolve));
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function register(url, email) {
  const response = await fetch(`${url}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "valid-password-123" }),
  });
  return response.json();
}

test("admin analytics returns aggregate-only usage and feedback", async () => {
  await withServer(async (url) => {
    const admin = await register(url, "image-admin@test.local");
    const response = await fetch(`${url}/api/admin/analytics`, {
      headers: { authorization: `Bearer ${admin.token}` },
    });
    const result = await response.json();

    assert.equal(response.status, 200);
    assert.equal(typeof result.conversations, "number");
    assert.equal(typeof result.failures, "number");
    assert.equal(result.usageByDay.length, 7);
    assert.equal(typeof result.performance.samples, "number");
    assert.equal(Object.hasOwn(result, "message"), false);
    assert.equal(Object.hasOwn(result, "userId"), false);
  });
});

test("image enhancement requires a configured provider and editor access", async () => {
  await withServer(async (url) => {
    const admin = await register(url, "insights-admin@test.local");
    const viewer = await register(url, "insights-viewer@test.local");
    const image = {
      name: "sample.png",
      type: "image/png",
      data: "data:image/png;base64,aQ==",
    };
    const request = (token, style) =>
      fetch(`${url}/api/images/enhance`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ image, style }),
      });

    const forbidden = await request(viewer.token, "sketch");
    const unavailable = await request(admin.token, "sketch");

    assert.equal(forbidden.status, 403);
    assert.equal(unavailable.status, 503);
    assert.match((await unavailable.json()).error, /not configured/);

    process.env.IMAGE_API_URL = "https://images.test.local/v1/images/edits";
    process.env.IMAGE_API_KEY = "test-image-key";
    const originalFetch = global.fetch;
    global.fetch = async (url, options) => {
      if (url !== process.env.IMAGE_API_URL) return originalFetch(url, options);
      assert.equal(options.method, "POST");
      return new Response(JSON.stringify({ data: [{ b64_json: "aQ==" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    try {
      const enhanced = await request(admin.token, "sketch");
      const result = await enhanced.json();
      assert.equal(enhanced.status, 200);
      assert.equal(result.image.type, "image/png");
      assert.match(result.image.data, /^data:image\/png;base64,/);
    } finally {
      global.fetch = originalFetch;
      delete process.env.IMAGE_API_URL;
      delete process.env.IMAGE_API_KEY;
    }
  });
});
