const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "weather-route-test-secret-at-least-32-bytes";
const app = require("../src/app");
const userModel = require("../src/models/user.model");

test("chat returns a clear gateway error when the weather provider fails", async () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.OPENWEATHER_KEY;
  process.env.OPENWEATHER_KEY = "test-invalid-weather-key";
  const user = userModel.create({
    email: "weather-route@test.local",
    passwordHash: "hash",
    role: "editor",
  });
  const token = jwt.sign({ sub: user.id }, process.env.JWT_SECRET, {
    algorithm: "HS256",
  });
  const server = app.listen(0);

  try {
    await new Promise((resolve) => server.once("listening", resolve));
    global.fetch = async (input, options) => {
      const url = new URL(input);
      if (url.hostname === "127.0.0.1") return originalFetch(input, options);
      assert.equal(url.hostname, "api.openweathermap.org");
      return {
        ok: false,
        status: 401,
        json: async () => ({ message: "Invalid API key" }),
      };
    };

    const response = await originalFetch(
      `http://127.0.0.1:${server.address().port}/api/school/chat`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: "What is the weature of Pune city?" }),
      },
    );
    const body = await response.json();
    assert.equal(response.status, 502);
    assert.match(body.error, /Weather lookup is temporarily unavailable/i);
    assert.doesNotMatch(body.error, /Internal server error/i);
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENWEATHER_KEY;
    else process.env.OPENWEATHER_KEY = originalKey;
    await new Promise((resolve) => server.close(resolve));
  }
});
