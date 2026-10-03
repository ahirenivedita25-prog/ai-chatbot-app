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

test("weather tool serves a seven-day forecast with WeatherAPI credentials only", async () => {
  const originalFetch = global.fetch;
  const originalWeatherApiKey = process.env.WEATHERAPI_KEY;
  const originalOpenWeatherKey = process.env.OPENWEATHER_KEY;
  process.env.WEATHERAPI_KEY = "weatherapi-route-test-key";
  delete process.env.OPENWEATHER_KEY;
  const user = userModel.create({
    email: "weatherapi-route@test.local",
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
      assert.equal(url.hostname, "api.weatherapi.com");
      assert.equal(url.searchParams.get("days"), "7");
      return {
        ok: true,
        json: async () => ({
          location: { name: "Pune" },
          forecast: {
            forecastday: Array.from({ length: 7 }, (_, index) => ({
              date: `2026-10-${String(index + 4).padStart(2, "0")}`,
              day: {
                maxtemp_c: 30,
                mintemp_c: 20,
                condition: { text: "Sunny" },
                avghumidity: 50,
                maxwind_kph: 10,
              },
            })),
          },
        }),
      };
    };

    const response = await originalFetch(
      `http://127.0.0.1:${server.address().port}/weather`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ location: "Pune", forecast: true }),
      },
    );
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.match(body.reply, /7-day forecast for Pune/);
    assert.equal((body.reply.match(/\| High /g) || []).length, 7);
  } finally {
    global.fetch = originalFetch;
    if (originalWeatherApiKey === undefined) delete process.env.WEATHERAPI_KEY;
    else process.env.WEATHERAPI_KEY = originalWeatherApiKey;
    if (originalOpenWeatherKey === undefined)
      delete process.env.OPENWEATHER_KEY;
    else process.env.OPENWEATHER_KEY = originalOpenWeatherKey;
    await new Promise((resolve) => server.close(resolve));
  }
});
