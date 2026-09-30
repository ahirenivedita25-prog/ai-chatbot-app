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
    assert.deepEqual(reply, {
      summary: "Appointments may be available tomorrow.",
      reasoning: "The clinic schedule determines live availability.",
      details: ["Availability changes during the day."],
      nextSteps: ["Call the clinic to confirm a time."],
      caveat: "Live booking access is not connected.",
      table: null,
      chart: null,
    });
    assert.equal(payload.messages[0].role, "system");
    assert.match(payload.messages[0].content, /clinic desk/i);
    assert.match(payload.messages[0].content, /moonlit/i);
    assert.equal(
      payload.messages[1].content,
      "Do you have appointments tomorrow?",
    );
    assert.equal(
      request.options.headers.Authorization,
      "Bearer test-provider-key",
    );
    assert.match(
      payload.messages[0].content,
      /Return ONLY valid JSON with this exact shape/,
    );
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
    assert.match(reply.summary, /not configured/i);
    assert.match(reply.details[0], /AI_API_KEY/);
  } finally {
    if (originalKey === undefined) delete process.env.AI_API_KEY;
    else process.env.AI_API_KEY = originalKey;
  }
});

test("chatbot service formats a plain provider response safely", async () => {
  process.env.AI_API_KEY = "test-provider-key";
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

  assert.deepEqual(reply, {
    summary: "Please share the restaurant location.",
    reasoning: "The provider returned a plain-text answer.",
    details: [],
    nextSteps: [],
    caveat: "",
    table: null,
    chart: null,
  });
  delete process.env.AI_API_KEY;
});

test("chatbot service forwards images and normalizes visual data", async () => {
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
                  content: JSON.stringify({
                    summary: "Sales increased over the period.",
                    table: {
                      columns: ["Month", "Sales"],
                      rows: [
                        ["May", "12"],
                        ["June", "18"],
                      ],
                    },
                    chart: {
                      type: "bar",
                      labels: ["May", "June"],
                      values: [12, 18],
                    },
                  }),
                },
              },
            ],
          }),
        };
      },
    });

    assert.equal(payload.messages[1].content[0].type, "text");
    assert.equal(payload.messages[1].content[1].type, "image_url");
    assert.equal(reply.table.rows.length, 2);
    assert.deepEqual(reply.chart.values, [12, 18]);
  } finally {
    if (originalKey === undefined) delete process.env.AI_API_KEY;
    else process.env.AI_API_KEY = originalKey;
  }
});
