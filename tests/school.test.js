const test = require("node:test");
const assert = require("node:assert/strict");
process.env.JWT_SECRET = "test-secret-for-chatbot";
const jwt = require("jsonwebtoken");
const userModel = require("../src/models/user.model");
const app = require("../src/app");
const user = userModel.create({
  email: "school@test.local",
  passwordHash: "test",
});
const authToken = jwt.sign(
  { sub: user.id, email: user.email },
  process.env.JWT_SECRET,
);

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const address = server.address();
      fetch(`http://127.0.0.1:${address.port}${path}`, options)
        .then(async (response) =>
          resolve({ status: response.status, body: await response.json() }),
        )
        .catch(reject)
        .finally(() => server.close());
    });
  });
}

test("school chatbot accepts a message", async () => {
  const response = await request("/api/school/chat", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({ message: "How do I pay fees?" }),
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.industry, "school");
});

test("school chatbot rejects an incomplete message", async () => {
  const response = await request("/api/school/chat", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({}),
  });

  assert.equal(response.status, 400);
});

test("school chatbot rejects anonymous requests", async () => {
  const response = await request("/api/school/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "Are you open?" }),
  });

  assert.equal(response.status, 401);
});
