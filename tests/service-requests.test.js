const test = require("node:test");
const assert = require("node:assert/strict");

process.env.JWT_SECRET = "service-request-test-secret-at-least-32-bytes";
const jwt = require("jsonwebtoken");
const userModel = require("../src/models/user.model");
const app = require("../src/app");

function tokenFor(user) {
  return jwt.sign({ sub: user.id, email: user.email }, process.env.JWT_SECRET);
}

async function withServer(run) {
  const server = app.listen(0);
  try {
    await new Promise((resolve) => server.once("listening", resolve));
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("service requests are private to their owner and reviewable by admins", async () => {
  const owner = userModel.create({
    email: "request-owner@test.local",
    passwordHash: "test",
    role: "viewer",
  });
  const other = userModel.create({
    email: "request-other@test.local",
    passwordHash: "test",
    role: "viewer",
  });
  const admin = userModel.create({
    email: "request-admin@test.local",
    passwordHash: "test",
    role: "admin",
  });

  await withServer(async (url) => {
    const createdResponse = await fetch(`${url}/api/service-requests`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${tokenFor(owner)}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        category: "hotel",
        details: "Please contact me about a room for two next weekend.",
      }),
    });
    const { request } = await createdResponse.json();
    assert.equal(createdResponse.status, 201);
    assert.equal(request.status, "received");

    const ownerResponse = await fetch(`${url}/api/service-requests`, {
      headers: { authorization: `Bearer ${tokenFor(owner)}` },
    });
    const ownerResult = await ownerResponse.json();
    assert.equal(ownerResult.requests.length, 1);
    assert.equal(ownerResult.requests[0].details, request.details);

    const otherResponse = await fetch(`${url}/api/service-requests`, {
      headers: { authorization: `Bearer ${tokenFor(other)}` },
    });
    assert.deepEqual((await otherResponse.json()).requests, []);

    const adminResponse = await fetch(`${url}/api/service-requests`, {
      headers: { authorization: `Bearer ${tokenFor(admin)}` },
    });
    const adminResult = await adminResponse.json();
    assert.ok(adminResult.requests.some((item) => item.id === request.id));

    const updateResponse = await fetch(
      `${url}/api/service-requests/${request.id}`,
      {
        method: "PATCH",
        headers: {
          authorization: `Bearer ${tokenFor(admin)}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ status: "in_review" }),
      },
    );
    assert.equal(updateResponse.status, 200);
    assert.equal((await updateResponse.json()).request.status, "in_review");
  });
});

test("service request intake refuses sensitive banking and payment credentials", async () => {
  const user = userModel.create({
    email: "request-safety@test.local",
    passwordHash: "test",
    role: "viewer",
  });
  await withServer(async (url) => {
    const response = await fetch(`${url}/api/service-requests`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${tokenFor(user)}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        category: "banking",
        details: "My card number is 4111 1111 1111 1111",
      }),
    });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /Do not include/);
  });
});
