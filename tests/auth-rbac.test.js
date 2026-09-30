const test = require("node:test");
const assert = require("node:assert/strict");

process.env.JWT_SECRET = "test-secret-long-enough-for-auth-rbac-suite";
process.env.ADMIN_EMAILS = "owner@test.local,adminmenu@test.local";
const app = require("../src/app");
const auditModel = require("../src/models/audit.model");

async function withServer(run) {
  const server = app.listen(0);
  try {
    await new Promise((resolve) => server.once("listening", resolve));
    const url = `http://127.0.0.1:${server.address().port}`;
    await run(url);
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
  return { response, body: await response.json() };
}

test("registration assigns admin only to configured addresses", async () => {
  await withServer(async (url) => {
    const admin = await register(url, "adminmenu@test.local");
    const member = await register(url, "member@test.local");

    assert.equal(admin.response.status, 201);
    assert.equal(admin.body.user.role, "admin");
    assert.equal(member.response.status, 201);
    assert.equal(member.body.user.role, "user");
    assert.match(admin.response.headers.get("set-cookie"), /HttpOnly/i);
  });
});

test("refresh rotates tokens and the previous refresh token is rejected", async () => {
  await withServer(async (url) => {
    const { response, body } = await register(url, "refresh@test.local");
    const initialCookie = response.headers.get("set-cookie").split(";")[0];
    const refreshed = await fetch(`${url}/api/auth/refresh`, {
      method: "POST",
      headers: { cookie: initialCookie },
    });
    const refreshedBody = await refreshed.json();
    const nextCookie = refreshed.headers.get("set-cookie").split(";")[0];

    assert.equal(refreshed.status, 200);
    assert.notEqual(nextCookie, initialCookie);
    assert.notEqual(refreshedBody.token, body.token);

    const replay = await fetch(`${url}/api/auth/refresh`, {
      method: "POST",
      headers: { cookie: initialCookie },
    });
    assert.equal(replay.status, 401);
  });
});

test("admin routes deny regular users and write audit events", async () => {
  await withServer(async (url) => {
    const admin = await register(url, "owner@test.local");
    const member = await register(url, "member2@test.local");
    const adminResponse = await fetch(`${url}/api/admin/settings`, {
      headers: { authorization: `Bearer ${admin.body.token}` },
    });
    const memberResponse = await fetch(`${url}/api/admin/settings`, {
      headers: { authorization: `Bearer ${member.body.token}` },
    });
    const settings = await adminResponse.json();

    assert.equal(adminResponse.status, 200);
    assert.equal(settings.modelVersion, "moonlit-brain-v1");
    assert.equal(memberResponse.status, 403);
    assert.ok(
      (await auditModel.list()).some(
        (event) => event.action === "admin.get/settings",
      ),
    );
  });
});

test("protected chat routes reject requests without a valid access token", async () => {
  await withServer(async (url) => {
    const response = await fetch(`${url}/api/school/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "How do I pay tuition?" }),
    });
    assert.equal(response.status, 401);
  });
});
