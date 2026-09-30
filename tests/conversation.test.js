const test = require("node:test");
const assert = require("node:assert/strict");
const userModel = require("../src/models/user.model");
const conversationModel = require("../src/models/conversation.model");
const { answerMessage } = require("../src/services/chat.service");

test("chat replies include model version and store encrypted user metadata", async () => {
  const originalKey = process.env.AI_API_KEY;
  const originalVersion = process.env.MOONLIT_MODEL_VERSION;
  delete process.env.AI_API_KEY;
  process.env.MOONLIT_MODEL_VERSION = "moonlit-brain-v2";
  const user = userModel.create({
    email: "conversation@test.local",
    passwordHash: "hash",
  });

  try {
    const result = await answerMessage({
      userId: user.id,
      industry: "school",
      message: "How do I pay tuition fees?",
      attachments: [],
    });
    const [saved] = await conversationModel.listForUser(user.id);

    assert.equal(result.modelVersion, "moonlit-brain-v2");
    assert.equal(typeof result.reply, "string");
    assert.equal(saved.userId, user.id);
    assert.equal(saved.intent, "billing");
    assert.equal(saved.modelVersion, "moonlit-brain-v2");
    assert.equal(saved.message, "How do I pay tuition fees?");
    assert.match(saved.createdAt, /\d{4}-\d{2}-\d{2}/);
    assert.doesNotMatch(JSON.stringify(saved), /ciphertext|authTag/);
  } finally {
    if (originalKey === undefined) delete process.env.AI_API_KEY;
    else process.env.AI_API_KEY = originalKey;
    if (originalVersion === undefined) delete process.env.MOONLIT_MODEL_VERSION;
    else process.env.MOONLIT_MODEL_VERSION = originalVersion;
  }
});

test("users can retrieve only their own conversation records", async () => {
  const first = userModel.create({
    email: "first-history@test.local",
    passwordHash: "hash",
  });
  const second = userModel.create({
    email: "second-history@test.local",
    passwordHash: "hash",
  });
  await conversationModel.create({
    userId: first.id,
    industry: "clinic",
    intent: "appointment",
    modelVersion: "moonlit-brain-v1",
    message: "Book a visit",
    reply: "Please contact the clinic to confirm.",
  });

  const firstRecords = await conversationModel.listForUser(first.id);
  const secondRecords = await conversationModel.listForUser(second.id);
  assert.equal(firstRecords.length, 1);
  assert.equal(secondRecords.length, 0);
});
