const test = require("node:test");
const assert = require("node:assert/strict");
const { classifyIntent } = require("../src/services/intent.service");
const {
  extractLocation,
  getWeatherReply,
} = require("../src/services/weather.service");

test("weather intent recognizes weather, temperature, and forecast", () => {
  assert.equal(classifyIntent("What's the weather in Paris?"), "weather");
  assert.equal(classifyIntent("What is the weature of Pune city?"), "weather");
  assert.equal(classifyIntent("What is the wether in Pune?"), "weather");
  assert.equal(classifyIntent("Temperature for Tokyo"), "weather");
  assert.equal(classifyIntent("Forecast at New York tomorrow"), "weather");
  assert.equal(
    classifyIntent("The store has a warm atmosphere"),
    "general_support",
  );
});

test("weather location extraction removes forecast date words", () => {
  assert.equal(extractLocation("Weather in New York tomorrow?"), "New York");
  assert.equal(extractLocation("What is the weature of Pune city?"), "Pune");
  assert.equal(extractLocation("Temperature in Paris"), "Paris");
  assert.equal(extractLocation("weather please"), null);
});

test("weather reply uses the API and formats values as a concise icon list", async () => {
  const originalKey = process.env.WEATHER_API_KEY;
  process.env.WEATHER_API_KEY = "test-weather-key";
  let requestedUrl;

  try {
    const reply = await getWeatherReply({
      message: "What's the weather in Paris?",
      isForecast: false,
      transport: async (url, options) => {
        requestedUrl = new URL(url);
        assert.equal(options.method, "GET");
        return {
          ok: true,
          json: async () => ({
            name: "Paris",
            weather: [{ id: 801, description: "partly cloudy" }],
            main: { temp: 28, humidity: 65 },
            wind: { speed: 12 / 3.6 },
          }),
        };
      },
    });

    assert.equal(requestedUrl.searchParams.get("q"), "Paris");
    assert.equal(requestedUrl.searchParams.get("appid"), "test-weather-key");
    assert.equal(requestedUrl.searchParams.get("units"), "metric");
    assert.match(reply, /🌤️ Condition: Partly Cloudy/);
    assert.match(reply, /🌡️ Temperature: 28°C/);
    assert.match(reply, /💧 Humidity: 65%/);
    assert.match(reply, /🌬️ Wind: 12 km\/h/);
    assert.ok(reply.split("\n").length <= 5);
  } finally {
    if (originalKey === undefined) delete process.env.WEATHER_API_KEY;
    else process.env.WEATHER_API_KEY = originalKey;
  }
});

test("weather reply asks for a location instead of guessing", async () => {
  const reply = await getWeatherReply({
    message: "What's the weather?",
    isForecast: false,
  });
  assert.equal(reply, "Which city or location should I check the weather for?");
});
