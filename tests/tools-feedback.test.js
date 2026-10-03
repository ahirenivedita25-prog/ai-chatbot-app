const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "tool-feedback-test-secret-at-least-32-bytes";
const app = require("../src/app");
const userModel = require("../src/models/user.model");
const conversationModel = require("../src/models/conversation.model");
const { compareItems } = require("../src/services/compare.service");

async function withServer(run) {
  const server = app.listen(0);
  try {
    await new Promise((resolve) => server.once("listening", resolve));
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function createToken(user) {
  return jwt.sign({ sub: user.id }, process.env.JWT_SECRET, {
    algorithm: "HS256",
  });
}

test("compare service validates and returns comparable structured rows", () => {
  const result = compareItems([
    { name: "Basic", price: 10, warranty: "1 year" },
    { name: "Plus", price: 15, warranty: "2 years" },
  ]);
  assert.deepEqual(result.columns, ["name", "price", "warranty"]);
  assert.equal(result.rows[1].price, 15);
  assert.throws(() => compareItems([{ name: "only one" }]), /between 2 and 10/);
});

test("tool endpoints require JWT and compare caller-provided data", async () => {
  const user = userModel.create({
    email: "tools-user@test.local",
    passwordHash: "hash",
  });
  const token = createToken(user);

  await withServer(async (url) => {
    const unauthorized = await fetch(`${url}/compare`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: [{ name: "A" }, { name: "B" }] }),
    });
    assert.equal(unauthorized.status, 401);

    const response = await fetch(`${url}/compare`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        items: [
          { name: "Basic", price: 10 },
          { name: "Plus", price: 15 },
        ],
      }),
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(body.columns, ["name", "price"]);
    assert.equal(body.rows.length, 2);
  });
});

test("weather and location endpoints use OpenWeather and return structured results", async () => {
  const originalKey = process.env.OPENWEATHER_KEY;
  const originalAlias = process.env.WEATHER_API_KEY;
  const originalFetch = global.fetch;
  process.env.OPENWEATHER_KEY = "test-openweather-key";
  delete process.env.WEATHER_API_KEY;
  global.fetch = async (input) => {
    const url = new URL(input);
    if (url.pathname.endsWith("/weather")) {
      return {
        ok: true,
        json: async () => ({
          name: "Paris",
          weather: [{ id: 801, description: "partly cloudy" }],
          main: { temp: 22, humidity: 60 },
          wind: { speed: 3 },
        }),
      };
    }
    return {
      ok: true,
      json: async () => [
        {
          name: "Paris",
          state: "Ile-de-France",
          country: "FR",
          lat: 48.85,
          lon: 2.35,
        },
      ],
    };
  };
  const user = userModel.create({
    email: "weather-tools@test.local",
    passwordHash: "hash",
  });
  const token = createToken(user);

  try {
    await withServer(async (url) => {
      const headers = {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      };
      const weatherResponse = await originalFetch(`${url}/weather`, {
        method: "POST",
        headers,
        body: JSON.stringify({ location: "Paris" }),
      });
      const weather = await weatherResponse.json();
      assert.equal(weatherResponse.status, 200);
      assert.match(weather.reply, /🌡️ Temperature: 22°C/);

      const locationResponse = await originalFetch(`${url}/location`, {
        method: "POST",
        headers,
        body: JSON.stringify({ query: "Paris" }),
      });
      const locations = await locationResponse.json();
      assert.equal(locationResponse.status, 200);
      assert.equal(locations.locations[0].country, "FR");
      assert.equal(locations.locations[0].latitude, 48.85);
    });
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENWEATHER_KEY;
    else process.env.OPENWEATHER_KEY = originalKey;
    if (originalAlias === undefined) delete process.env.WEATHER_API_KEY;
    else process.env.WEATHER_API_KEY = originalAlias;
  }
});

test("weather tool returns 503 when OpenWeather credentials are missing", async () => {
  const originalKey = process.env.OPENWEATHER_KEY;
  const originalAlias = process.env.WEATHER_API_KEY;
  delete process.env.OPENWEATHER_KEY;
  delete process.env.WEATHER_API_KEY;
  const user = userModel.create({
    email: "weather-unconfigured@test.local",
    passwordHash: "hash",
  });

  try {
    await withServer(async (url) => {
      const response = await fetch(`${url}/weather`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${createToken(user)}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ location: "Paris" }),
      });
      assert.equal(response.status, 503);
      assert.match((await response.json()).error, /not configured/i);
    });
  } finally {
    if (originalKey === undefined) delete process.env.OPENWEATHER_KEY;
    else process.env.OPENWEATHER_KEY = originalKey;
    if (originalAlias === undefined) delete process.env.WEATHER_API_KEY;
    else process.env.WEATHER_API_KEY = originalAlias;
  }
});

test("feedback is owner-scoped and visible to an admin for review", async () => {
  const member = userModel.create({
    email: "feedback-member@test.local",
    passwordHash: "hash",
  });
  const other = userModel.create({
    email: "feedback-other@test.local",
    passwordHash: "hash",
  });
  const admin = userModel.create({
    email: "feedback-admin@test.local",
    passwordHash: "hash",
    role: "admin",
  });
  const conversation = await conversationModel.create({
    userId: member.id,
    industry: "school",
    intent: "general_support",
    modelVersion: "moonlit-brain-v1",
    message: "Question",
    reply: "Answer",
  });

  await withServer(async (url) => {
    const feedbackUrl = `${url}/api/conversations/${conversation.id}/feedback`;
    const outsiderResponse = await fetch(feedbackUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${createToken(other)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ rating: "helpful" }),
    });
    assert.equal(outsiderResponse.status, 404);

    const response = await fetch(feedbackUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${createToken(member)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ rating: "not_helpful" }),
    });
    assert.equal(response.status, 201);
    assert.equal((await response.json()).feedback.rating, "not_helpful");

    const threadsResponse = await fetch(`${url}/api/conversations/threads`, {
      headers: { Authorization: `Bearer ${createToken(member)}` },
    });
    const threadsBody = await threadsResponse.json();
    const savedAnswer = threadsBody.threads
      .flatMap((thread) => thread.messages)
      .find((message) => message.conversationId === String(conversation.id));
    assert.equal(savedAnswer.feedback, "not_helpful");

    const adminResponse = await fetch(`${url}/api/admin/feedback`, {
      headers: { Authorization: `Bearer ${createToken(admin)}` },
    });
    const adminBody = await adminResponse.json();
    assert.equal(adminResponse.status, 200);
    assert.ok(adminBody.feedback.some((entry) => entry.userId === member.id));
  });
});
