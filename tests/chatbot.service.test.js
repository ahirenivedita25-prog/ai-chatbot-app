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
                  content: "Please call the clinic to confirm availability.",
                },
              },
            ],
          }),
        };
      },
    });

    const payload = JSON.parse(request.options.body);
    assert.equal(reply, "Please call the clinic to confirm availability.");
    assert.equal(payload.messages[0].role, "system");
    assert.match(payload.messages[0].content, /clinic support/i);
    assert.equal(
      payload.messages[1].content,
      "Do you have appointments tomorrow?",
    );
    assert.equal(
      request.options.headers.Authorization,
      "Bearer test-provider-key",
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
    assert.match(reply, /prototype mode/i);
    assert.match(reply, /AI_API_KEY/);
  } finally {
    if (originalKey === undefined) delete process.env.AI_API_KEY;
    else process.env.AI_API_KEY = originalKey;
  }
});
