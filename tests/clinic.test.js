const test = require("node:test");
const assert = require("node:assert/strict");
process.env.JWT_SECRET = "test-secret-for-chatbot";
const jwt = require("jsonwebtoken");
const userModel = require("../src/models/user.model");
const app = require("../src/app");
const user = userModel.create({
  email: "clinic@test.local",
  passwordHash: "test",
});
const authToken = jwt.sign(
  { sub: user.id, email: user.email },
  process.env.JWT_SECRET,
);

test("clinic chatbot exposes a health-ready API", async () => {
  const server = app.listen(0);
  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/clinic/chat`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ message: "Book an appointment" }),
    });

    assert.equal(response.status, 200);
    assert.equal((await response.json()).industry, "clinic");
  } finally {
    server.close();
  }
});
