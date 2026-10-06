const test = require("node:test");
const assert = require("node:assert/strict");
const { generateReply } = require("../src/services/chatbot.service");

test("chatbot service sends industry context to the AI provider", async () => {
  const originalKey = process.env.AI_API_KEY;
  process.env.AI_API_KEY = "test-provider-key";
  let request;

  try {
    const reply = await generateReply({
      industry: "clinic",
      message: "Do you have appointments tomorrow?",
      transport: async (url, options) => {
        request = { url, options };
        return {
          ok: true,
          json: async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    summary: "Appointments may be available tomorrow.",
                    reasoning:
                      "The clinic schedule determines live availability.",
                    details: ["Availability changes during the day."],
                    nextSteps: ["Call the clinic to confirm a time."],
                    caveat: "Live booking access is not connected.",
                  }),
                },
              },
            ],
          }),
        };
      },
    });

    const payload = JSON.parse(request.options.body);
    assert.equal(typeof reply, "string");
    assert.match(reply, /Appointments may be available tomorrow/);
    assert.match(reply, /Call the clinic to confirm a time/);
    assert.doesNotMatch(reply, /"summary"|"reasoning"/);
    assert.equal(payload.messages[0].role, "system");
    assert.match(payload.messages[0].content, /clinic desk/i);
    assert.match(payload.messages[0].content, /moonlit/i);
    assert.match(payload.messages[0].content, /numbered steps/i);
    assert.match(payload.messages[0].content, /aligned plain-text tables/i);
    assert.match(payload.messages[0].content, /text bar charts/i);
    assert.match(payload.messages[0].content, /location-based requests/i);
    assert.match(payload.messages[0].content, /Summary:/);
    assert.match(payload.messages[0].content, /Details:/);
    assert.match(payload.messages[0].content, /up to five distinct/i);
    assert.match(
      payload.messages[0].content,
      /Name, Location, Contact, and Description/,
    );
    assert.match(payload.messages[0].content, /instead of guessing/i);
    assert.match(payload.messages[0].content, /do not claim to have browsed/i);
    assert.equal(
      payload.messages[1].content,
      "Do you have appointments tomorrow?",
    );
    assert.equal(
      request.options.headers.Authorization,
      "Bearer test-provider-key",
    );
    assert.match(payload.messages[0].content, /plain-text chat bubble/);
  } finally {
    if (originalKey === undefined) delete process.env.AI_API_KEY;
    else process.env.AI_API_KEY = originalKey;
  }
});

test("chatbot service explains when real AI is not configured", async () => {
  const originalKey = process.env.AI_API_KEY;
  delete process.env.AI_API_KEY;

  try {
    const reply = await generateReply({
      industry: "school",
      message: "How do fees work?",
    });
    assert.match(reply, /not configured/i);
    assert.match(reply, /AI_API_KEY/);
  } finally {
    if (originalKey === undefined) delete process.env.AI_API_KEY;
    else process.env.AI_API_KEY = originalKey;
  }
});

test("chatbot service routes weather requests to the weather API", async () => {
  const originalAiKey = process.env.AI_API_KEY;
  const originalWeatherKey = process.env.WEATHER_API_KEY;
  delete process.env.AI_API_KEY;
  process.env.WEATHER_API_KEY = "test-weather-key";
  let requestedUrl;

  try {
    const reply = await generateReply({
      industry: "school",
      message: "What is the weature of Pune city?",
      transport: async (url) => {
        requestedUrl = new URL(url);
        return {
          ok: true,
          json: async () => ({
            name: "Paris",
            weather: [{ id: 800, description: "clear sky" }],
            main: { temp: 24, humidity: 50 },
            wind: { speed: 2 },
          }),
        };
      },
    });

    assert.equal(requestedUrl.searchParams.get("q"), "Pune");
    assert.match(reply, /☀️ Condition: Clear Sky/);
    assert.match(reply, /🌡️ Temperature: 24°C/);
    assert.match(reply, /💧 Humidity: 50%/);
    assert.match(reply, /🌬️ Wind: 7 km\/h/);
  } finally {
    if (originalAiKey === undefined) delete process.env.AI_API_KEY;
    else process.env.AI_API_KEY = originalAiKey;
    if (originalWeatherKey === undefined) delete process.env.WEATHER_API_KEY;
    else process.env.WEATHER_API_KEY = originalWeatherKey;
  }
});

test("chatbot service formats a plain provider response safely", async () => {
  const originalKey = process.env.AI_API_KEY;
  process.env.AI_API_KEY = "test-provider-key";
  try {
    const reply = await generateReply({
      industry: "restaurant",
      message: "Are you open?",
      transport: async () => ({
        ok: true,
        json: async () => ({
          choices: [
            { message: { content: "Please share the restaurant location." } },
          ],
        }),
      }),
    });
    assert.equal(reply, "Please share the restaurant location.");
  } finally {
    if (originalKey === undefined) delete process.env.AI_API_KEY;
    else process.env.AI_API_KEY = originalKey;
  }
});

test("chatbot service forwards images and returns a plain-text answer", async () => {
  const originalKey = process.env.AI_API_KEY;
  process.env.AI_API_KEY = "test-provider-key";
  let payload;

  try {
    const reply = await generateReply({
      industry: "retail",
      message: "Summarize this sales chart",
      attachments: [
        {
          name: "sales.png",
          type: "image/png",
          data: "data:image/png;base64,aGVsbG8=",
        },
      ],
      transport: async (_url, options) => {
        payload = JSON.parse(options.body);
        return {
          ok: true,
          json: async () => ({
            choices: [
              {
                message: {
                  content: "Sales increased over the period.",
                },
              },
            ],
          }),
        };
      },
    });

    assert.equal(payload.messages[1].content[0].type, "text");
    assert.equal(payload.messages[1].content[1].type, "image_url");
    assert.equal(reply, "Sales increased over the period.");
  } finally {
    if (originalKey === undefined) delete process.env.AI_API_KEY;
    else process.env.AI_API_KEY = originalKey;
  }
});

test("chatbot service includes text attachments and converts legacy JSON to text", async () => {
  const originalKey = process.env.AI_API_KEY;
  process.env.AI_API_KEY = "test-provider-key";
  let payload;

  try {
    const reply = await generateReply({
      industry: "school",
      message: "Summarize this note",
      attachments: [
        { name: "notes.txt", type: "text/plain", text: "Bring the form." },
      ],
      transport: async (_url, options) => {
        payload = JSON.parse(options.body);
        return {
          ok: true,
          json: async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    summary: "Bring the completed form.",
                    details: ["The note mentions a form."],
                  }),
                },
              },
            ],
          }),
        };
      },
    });

    assert.match(payload.messages[1].content, /Bring the form\./);
    assert.equal(
      reply,
      "Bring the completed form.\n\nThe note mentions a form.",
    );
    assert.doesNotMatch(reply, /^[{[]|"summary"/);
  } finally {
    if (originalKey === undefined) delete process.env.AI_API_KEY;
    else process.env.AI_API_KEY = originalKey;
  }
});

test("chatbot service never exposes unrecognized provider JSON", async () => {
  const originalKey = process.env.AI_API_KEY;
  process.env.AI_API_KEY = "test-provider-key";

  try {
    const reply = await generateReply({
      industry: "school",
      message: "What is the answer?",
      transport: async () => ({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  answer: "Forty-two.",
                  metadata: { source: "the attached note" },
                  reasoning: "This internal reasoning must stay private.",
                }),
              },
            },
          ],
        }),
      }),
    });

    assert.equal(reply, "Forty-two.\n\nthe attached note");
    assert.doesNotMatch(reply, /[{}\[\]]|reasoning|metadata/);
  } finally {
    if (originalKey === undefined) delete process.env.AI_API_KEY;
    else process.env.AI_API_KEY = originalKey;
  }
});

test("chatbot service replaces JSON without an answer with a readable fallback", async () => {
  const originalKey = process.env.AI_API_KEY;
  process.env.AI_API_KEY = "test-provider-key";

  try {
    const reply = await generateReply({
      industry: "school",
      message: "Can you help?",
      transport: async () => ({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  reasoning: "This private reasoning is not an answer.",
                }),
              },
            },
          ],
        }),
      }),
    });

    assert.equal(
      reply,
      "I couldn't produce a readable answer. Please try asking again.",
    );
    assert.doesNotMatch(reply, /reasoning|[{}]/);
  } finally {
    if (originalKey === undefined) delete process.env.AI_API_KEY;
    else process.env.AI_API_KEY = originalKey;
  }
});
