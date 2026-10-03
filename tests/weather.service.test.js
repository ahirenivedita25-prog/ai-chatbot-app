const test = require("node:test");
const assert = require("node:assert/strict");
const { classifyIntent } = require("../src/services/intent.service");
const {
  extractLocation,
  getWeatherReply,
  getWeatherForLocation,
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

test("seven-day WeatherAPI forecast includes daily weather details and trends", async () => {
  const originalWeatherApiKey = process.env.WEATHERAPI_KEY;
  const originalOpenWeatherKey = process.env.OPENWEATHER_KEY;
  process.env.WEATHERAPI_KEY = "weatherapi-test-key";
  delete process.env.OPENWEATHER_KEY;
  const requestedUrl = new URL("https://weatherapi.test");

  try {
    const reply = await getWeatherForLocation({
      location: "Pune",
      isForecast: true,
      transport: async (url) => {
        const requestUrl = new URL(url);
        requestedUrl.href = requestUrl.href;
        return {
          ok: true,
          json: async () => ({
            location: { name: "Pune" },
            forecast: {
              forecastday: Array.from({ length: 7 }, (_, index) => ({
                date: `2026-10-${String(index + 4).padStart(2, "0")}`,
                day: {
                  maxtemp_c: 30 - index,
                  mintemp_c: 20 - index,
                  condition: {
                    text: index === 0 ? "Sunny" : "Patchy rain nearby",
                  },
                  avghumidity: 55 + index,
                  maxwind_kph: 12 + index,
                },
              })),
            },
          }),
        };
      },
    });

    assert.equal(requestedUrl.searchParams.get("days"), "7");
    assert.equal(requestedUrl.searchParams.get("q"), "Pune");
    assert.match(reply, /7-day forecast for Pune/);
    assert.match(
      reply,
      /☀️ Sunny \| High 30°C \/ Low 20°C \| Humidity 55% \| Wind 12 km\/h/,
    );
    assert.match(reply, /🌧️ Patchy rain nearby/);
    assert.match(reply, /Temperature trend \(highs\): 30° → 29°/);
    assert.equal((reply.match(/\| High /g) || []).length, 7);
  } finally {
    if (originalWeatherApiKey === undefined) delete process.env.WEATHERAPI_KEY;
    else process.env.WEATHERAPI_KEY = originalWeatherApiKey;
    if (originalOpenWeatherKey === undefined)
      delete process.env.OPENWEATHER_KEY;
    else process.env.OPENWEATHER_KEY = originalOpenWeatherKey;
  }
});

test("seven-day OpenWeather forecast geocodes the city then uses One Call", async () => {
  const originalOpenWeatherKey = process.env.OPENWEATHER_KEY;
  const originalWeatherApiKey = process.env.WEATHERAPI_KEY;
  process.env.OPENWEATHER_KEY = "openweather-test-key";
  delete process.env.WEATHERAPI_KEY;
  const urls = [];

  try {
    const reply = await getWeatherForLocation({
      location: "Pune",
      isForecast: true,
      transport: async (url) => {
        const requestUrl = new URL(url);
        urls.push(requestUrl);
        if (
          requestUrl.hostname === "api.openweathermap.org" &&
          requestUrl.pathname.includes("/geo/")
        ) {
          return {
            ok: true,
            json: async () => [
              {
                name: "Pune",
                state: "Maharashtra",
                country: "IN",
                lat: 18.52,
                lon: 73.85,
              },
            ],
          };
        }
        return {
          ok: true,
          json: async () => ({
            daily: Array.from({ length: 8 }, (_, index) => ({
              dt: Date.UTC(2026, 9, 3 + index) / 1000,
              temp: { max: 31 - index, min: 21 - index },
              weather: [
                {
                  id: index === 0 ? 800 : 500,
                  description: index === 0 ? "clear sky" : "light rain",
                },
              ],
              humidity: 60 + index,
              wind_speed: 3 + index / 10,
            })),
          }),
        };
      },
    });

    assert.equal(urls.length, 2);
    assert.equal(urls[0].searchParams.get("q"), "Pune");
    assert.equal(urls[1].pathname, "/data/3.0/onecall");
    assert.equal(urls[1].searchParams.get("lat"), "18.52");
    assert.equal(urls[1].searchParams.get("lon"), "73.85");
    assert.equal((reply.match(/\| High /g) || []).length, 7);
    assert.match(reply, /7-day forecast for Pune, Maharashtra, IN/);
    assert.match(reply, /☀️ Clear sky/);
    assert.match(reply, /🌧️ Light rain/);
    assert.match(reply, /Humidity 60% \| Wind 11 km\/h/);
  } finally {
    if (originalOpenWeatherKey === undefined)
      delete process.env.OPENWEATHER_KEY;
    else process.env.OPENWEATHER_KEY = originalOpenWeatherKey;
    if (originalWeatherApiKey === undefined) delete process.env.WEATHERAPI_KEY;
    else process.env.WEATHERAPI_KEY = originalWeatherApiKey;
  }
});
