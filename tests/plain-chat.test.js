const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const app = require("../src/app");
const userModel = require("../src/models/user.model");

test("plain chat endpoint requires authentication and returns text", async () => {
  const originalSecret = process.env.JWT_SECRET;
  const originalKey = process.env.AI_API_KEY;
  const secret = "test-secret-that-is-long-enough-for-jwt-signing";
  process.env.JWT_SECRET = secret;
  delete process.env.AI_API_KEY;
  const user = userModel.create({
    email: "plain-chat@test.local",
    passwordHash: "hash",
  });
  const token = jwt.sign({ sub: user.id }, secret, { algorithm: "HS256" });
  const server = app.listen(0);

  try {
    const { port } = server.address();
    const unauthorized = await fetch(`http://127.0.0.1:${port}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "How do I pay fees?" }),
    });
    assert.equal(unauthorized.status, 401);

    const response = await fetch(`http://127.0.0.1:${port}/chat`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message: "How do I pay fees?" }),
    });
    const reply = await response.text();

    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /^text\/plain/);
    assert.match(reply, /not configured/i);
    assert.doesNotMatch(reply, /^[{[]/);
  } finally {
    server.close();
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
    if (originalKey === undefined) delete process.env.AI_API_KEY;
    else process.env.AI_API_KEY = originalKey;
  }
});
