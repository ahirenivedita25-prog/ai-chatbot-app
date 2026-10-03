const CURRENT_WEATHER_URL = "https://api.openweathermap.org/data/2.5/weather";
const WEATHER_FORECAST_URL = "https://api.openweathermap.org/data/2.5/forecast";
const LOCATION_SEARCH_URL = "https://api.openweathermap.org/geo/1.0/direct";

function extractLocation(message) {
  const match = message.match(/\b(?:in|for|at|of)\s+(.+?)(?:[?.!,]|$)/i);
  if (!match) return null;
  return (
    match[1]
      .replace(/\b(?:today|tomorrow|now|currently|this week|next week)\b/gi, "")
      .replace(/\s+city$/i, "")
      .trim() || null
  );
}

function conditionIcon(conditionCode) {
  if (conditionCode >= 200 && conditionCode < 300) return "🌩️";
  if (conditionCode >= 300 && conditionCode < 600) return "🌧️";
  if (conditionCode >= 600 && conditionCode < 700) return "❄️";
  if (conditionCode >= 700 && conditionCode < 800) return "🌫️";
  if (conditionCode === 800) return "☀️";
  return "🌤️";
}

function formatWeather(data, location, isForecast) {
  const reading = isForecast ? data.list?.[0] : data;
  if (!reading?.main || !reading?.weather?.[0]) {
    throw new Error("Weather API returned an invalid response");
  }
  const condition = reading.weather[0].description.replace(/\b\w/g, (letter) =>
    letter.toUpperCase(),
  );
  const locationName = isForecast ? data.city?.name : data.name;
  const windKmh = Math.round((reading.wind?.speed || 0) * 3.6);
  const heading = isForecast ? "Forecast" : "Current weather";

  return [
    `${heading}${locationName ? ` for ${locationName}` : ` for ${location}`}`,
    `${conditionIcon(reading.weather[0].id)} Condition: ${condition}`,
    `🌡️ Temperature: ${Math.round(reading.main.temp)}°C`,
    `💧 Humidity: ${reading.main.humidity}%`,
    `🌬️ Wind: ${windKmh} km/h`,
  ].join("\n");
}

async function getWeatherReply({ message, isForecast, transport = fetch }) {
  const location = extractLocation(message);
  if (!location) {
    return "Which city or location should I check the weather for?";
  }

  const apiKey = process.env.OPENWEATHER_KEY || process.env.WEATHER_API_KEY;
  if (!apiKey) {
    return "Weather lookup is not configured yet. Set OPENWEATHER_KEY to enable it.";
  }

  return getWeatherForLocation({ location, isForecast, transport });
}

async function getWeatherForLocation({
  location,
  isForecast = false,
  transport = fetch,
}) {
  const apiKey = process.env.OPENWEATHER_KEY || process.env.WEATHER_API_KEY;
  if (!apiKey) {
    return "Weather lookup is not configured yet. Set OPENWEATHER_KEY to enable it.";
  }

  const url = new URL(
    isForecast
      ? process.env.WEATHER_FORECAST_API_URL || WEATHER_FORECAST_URL
      : process.env.WEATHER_API_URL || CURRENT_WEATHER_URL,
  );
  url.searchParams.set("q", location);
  url.searchParams.set("appid", apiKey);
  url.searchParams.set("units", "metric");
  if (isForecast) url.searchParams.set("cnt", "1");

  const response = await transport(url, {
    method: "GET",
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) {
    throw new Error(
      `Weather API request failed with status ${response.status}`,
    );
  }

  const data = await response.json();
  return formatWeather(data, location, isForecast);
}

async function searchLocations({ query, transport = fetch }) {
  const apiKey = process.env.OPENWEATHER_KEY || process.env.WEATHER_API_KEY;
  if (!apiKey) throw new Error("Weather API is not configured");
  const url = new URL(process.env.LOCATION_API_URL || LOCATION_SEARCH_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "5");
  url.searchParams.set("appid", apiKey);
  const response = await transport(url, {
    method: "GET",
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) {
    throw new Error(
      `Location API request failed with status ${response.status}`,
    );
  }
  const locations = await response.json();
  if (!Array.isArray(locations))
    throw new Error("Location API returned an invalid response");
  return locations.map(({ name, state, country, lat, lon }) => ({
    name,
    state: state || null,
    country,
    latitude: lat,
    longitude: lon,
  }));
}

module.exports = {
  extractLocation,
  getWeatherReply,
  getWeatherForLocation,
  searchLocations,
};
