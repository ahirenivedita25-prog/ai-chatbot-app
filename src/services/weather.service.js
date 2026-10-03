const CURRENT_WEATHER_URL = "https://api.openweathermap.org/data/2.5/weather";
const LOCATION_SEARCH_URL = "https://api.openweathermap.org/geo/1.0/direct";
const OPENWEATHER_ONECALL_URL =
  "https://api.openweathermap.org/data/3.0/onecall";
const WEATHERAPI_FORECAST_URL = "https://api.weatherapi.com/v1/forecast.json";

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

function textConditionIcon(condition) {
  const normalized = String(condition || "").toLowerCase();
  if (/thunder|lightning/.test(normalized)) return "🌩️";
  if (/snow|sleet|ice|blizzard/.test(normalized)) return "❄️";
  if (/rain|drizzle|shower/.test(normalized)) return "🌧️";
  if (/fog|mist/.test(normalized)) return "🌫️";
  if (/sunny|clear/.test(normalized)) return "☀️";
  if (/cloud/.test(normalized)) return "☁️";
  return "🌤️";
}

function formatWeeklyForecast(days, location) {
  if (!Array.isArray(days) || days.length < 7) {
    throw new Error("Weather API returned an invalid seven-day forecast");
  }
  const daily = days.slice(0, 7);
  const lines = [`7-day forecast for ${location}`, ""];
  for (const day of daily) {
    const date = new Date(`${day.date}T12:00:00Z`);
    if (
      !Number.isFinite(date.getTime()) ||
      !Number.isFinite(day.high) ||
      !Number.isFinite(day.low) ||
      !Number.isFinite(day.humidity) ||
      !Number.isFinite(day.windKph)
    ) {
      throw new Error("Weather API returned an invalid seven-day forecast");
    }
    const label = new Intl.DateTimeFormat("en", {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }).format(date);
    const condition = String(day.condition || "Unknown");
    lines.push(
      `${label}: ${day.icon} ${condition.charAt(0).toUpperCase()}${condition.slice(1)} | High ${Math.round(day.high)}°C / Low ${Math.round(day.low)}°C | Humidity ${Math.round(day.humidity)}% | Wind ${Math.round(day.windKph)} km/h`,
    );
  }
  const highs = daily.map((day) => Math.round(day.high));
  const lows = daily.map((day) => Math.round(day.low));
  lines.push(
    "",
    `Temperature trend (highs): ${highs.join("° → ")}°C`,
    `Temperature trend (lows): ${lows.join("° → ")}°C`,
  );
  return lines.join("\n");
}

async function fetchJson(url, transport) {
  const response = await transport(url, {
    method: "GET",
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) {
    throw new Error(
      `Weather API request failed with status ${response.status}`,
    );
  }
  return response.json();
}

async function getWeatherApiForecast({ location, transport }) {
  const url = new URL(
    process.env.WEATHERAPI_FORECAST_URL || WEATHERAPI_FORECAST_URL,
  );
  url.searchParams.set("key", process.env.WEATHERAPI_KEY);
  url.searchParams.set("q", location);
  url.searchParams.set("days", "7");
  url.searchParams.set("aqi", "no");
  url.searchParams.set("alerts", "no");
  const data = await fetchJson(url, transport);
  const days = data.forecast?.forecastday?.map((entry) => ({
    date: entry.date,
    high: entry.day?.maxtemp_c,
    low: entry.day?.mintemp_c,
    condition: entry.day?.condition?.text || "Unknown",
    icon: textConditionIcon(entry.day?.condition?.text),
    humidity: entry.day?.avghumidity,
    windKph: entry.day?.maxwind_kph,
  }));
  const locationName = data.location?.name || location;
  return formatWeeklyForecast(days, locationName);
}

async function getOpenWeatherForecast({ location, apiKey, transport }) {
  const geocodeUrl = new URL(
    process.env.LOCATION_API_URL || LOCATION_SEARCH_URL,
  );
  geocodeUrl.searchParams.set("q", location);
  geocodeUrl.searchParams.set("limit", "1");
  geocodeUrl.searchParams.set("appid", apiKey);
  const places = await fetchJson(geocodeUrl, transport);
  if (
    !Array.isArray(places) ||
    !places[0] ||
    !Number.isFinite(places[0].lat) ||
    !Number.isFinite(places[0].lon)
  ) {
    throw new Error("Weather API returned an invalid location");
  }
  const forecastUrl = new URL(
    process.env.OPENWEATHER_ONECALL_URL || OPENWEATHER_ONECALL_URL,
  );
  forecastUrl.searchParams.set("lat", String(places[0].lat));
  forecastUrl.searchParams.set("lon", String(places[0].lon));
  forecastUrl.searchParams.set("appid", apiKey);
  forecastUrl.searchParams.set("units", "metric");
  forecastUrl.searchParams.set("exclude", "current,minutely,hourly,alerts");
  const data = await fetchJson(forecastUrl, transport);
  const days = data.daily?.map((entry) => {
    if (!Number.isFinite(entry.dt)) {
      throw new Error("Weather API returned an invalid seven-day forecast");
    }
    return {
      date: new Date(entry.dt * 1000).toISOString().slice(0, 10),
      high: entry.temp?.max,
      low: entry.temp?.min,
      condition: entry.weather?.[0]?.description || "Unknown",
      icon: conditionIcon(entry.weather?.[0]?.id),
      humidity: entry.humidity,
      windKph: (entry.wind_speed || 0) * 3.6,
    };
  });
  const locationName = [places[0].name, places[0].state, places[0].country]
    .filter(Boolean)
    .join(", ");
  return formatWeeklyForecast(days, locationName || location);
}

function formatWeather(data, location, isForecast) {
  const reading = data;
  if (!reading?.main || !reading?.weather?.[0]) {
    throw new Error("Weather API returned an invalid response");
  }
  const condition = reading.weather[0].description.replace(/\b\w/g, (letter) =>
    letter.toUpperCase(),
  );
  const locationName = data.name;
  const windKmh = Math.round((reading.wind?.speed || 0) * 3.6);
  const heading = "Current weather";

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

  const apiKey =
    process.env.WEATHERAPI_KEY ||
    process.env.OPENWEATHER_KEY ||
    process.env.WEATHER_API_KEY;
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
  if (isForecast) {
    if (process.env.WEATHERAPI_KEY) {
      return getWeatherApiForecast({ location, transport });
    }
    const openWeatherKey =
      process.env.OPENWEATHER_KEY || process.env.WEATHER_API_KEY;
    if (!openWeatherKey) {
      return "Weather lookup is not configured yet. Set WEATHERAPI_KEY or OPENWEATHER_KEY to enable it.";
    }
    return getOpenWeatherForecast({
      location,
      apiKey: openWeatherKey,
      transport,
    });
  }

  const apiKey = process.env.OPENWEATHER_KEY || process.env.WEATHER_API_KEY;
  if (!apiKey) {
    return "Weather lookup is not configured yet. Set OPENWEATHER_KEY to enable it.";
  }

  const url = new URL(process.env.WEATHER_API_URL || CURRENT_WEATHER_URL);
  url.searchParams.set("q", location);
  url.searchParams.set("appid", apiKey);
  url.searchParams.set("units", "metric");
  const data = await fetchJson(url, transport);
  return formatWeather(data, location, false);
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
  formatWeeklyForecast,
  textConditionIcon,
};
