const test = require("node:test");
const assert = require("node:assert/strict");
const app = require("../src/app");

test("chat status endpoint responds to ping", async () => {
  const server = app.listen(0);

  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/chat-status`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body, {
      status: "ok",
      service: "ai-chatbot-startup",
    });
  } finally {
    server.close();
  }
});
