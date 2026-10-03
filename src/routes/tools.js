const express = require("express");
const {
  getWeatherForLocation,
  searchLocations,
} = require("../services/weather.service");
const { compareItems } = require("../services/compare.service");

function handleExternalError(error, res, next) {
  if (/not configured/i.test(error.message)) {
    return res
      .status(503)
      .json({ error: "This external API is not configured" });
  }
  if (/API request failed|invalid response/i.test(error.message)) {
    return res.status(502).json({
      error: "The external data service could not complete the request",
    });
  }
  return next(error);
}

const weatherRouter = express.Router();
weatherRouter.post("/", async (req, res, next) => {
  const { location, forecast = false } = req.body || {};
  if (
    typeof location !== "string" ||
    !location.trim() ||
    location.length > 160 ||
    typeof forecast !== "boolean"
  ) {
    return res
      .status(400)
      .json({ error: "Provide a location and optional boolean forecast" });
  }
  if (!process.env.OPENWEATHER_KEY && !process.env.WEATHER_API_KEY) {
    return res.status(503).json({ error: "Weather API is not configured" });
  }
  try {
    const reply = await getWeatherForLocation({
      location: location.trim(),
      isForecast: forecast,
    });
    return res.json({ reply });
  } catch (error) {
    return handleExternalError(error, res, next);
  }
});

const locationRouter = express.Router();
locationRouter.post("/", async (req, res, next) => {
  const { query } = req.body || {};
  if (typeof query !== "string" || !query.trim() || query.length > 160) {
    return res.status(400).json({
      error: "query must be a non-empty string of at most 160 characters",
    });
  }
  try {
    return res.json({
      locations: await searchLocations({ query: query.trim() }),
    });
  } catch (error) {
    return handleExternalError(error, res, next);
  }
});

const compareRouter = express.Router();
compareRouter.post("/", (req, res) => {
  try {
    return res.json(compareItems(req.body?.items));
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

module.exports = { weatherRouter, locationRouter, compareRouter };
