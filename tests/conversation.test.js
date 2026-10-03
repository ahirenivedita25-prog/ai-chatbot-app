const test = require("node:test");
const assert = require("node:assert/strict");
const userModel = require("../src/models/user.model");
const conversationModel = require("../src/models/conversation.model");
const failedQueryModel = require("../src/models/failed-query.model");
const { answerMessage } = require("../src/services/chat.service");

test("chat replies include model version and store encrypted user metadata", async () => {
  const originalKey = process.env.AI_API_KEY;
  const originalVersion = process.env.MOONLIT_MODEL_VERSION;
  delete process.env.AI_API_KEY;
  process.env.MOONLIT_MODEL_VERSION = "moonlit-brain-v3";
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

    assert.equal(result.modelVersion, "moonlit-brain-v3");
    assert.equal(typeof result.reply, "string");
    assert.equal(saved.userId, user.id);
    assert.equal(saved.intent, "billing");
    assert.equal(saved.modelVersion, "moonlit-brain-v3");
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

test("provider failures record metadata without retaining the failed message", async () => {
  const originalKey = process.env.AI_API_KEY;
  const originalUrl = process.env.AI_API_URL;
  const originalVersion = process.env.MOONLIT_MODEL_VERSION;
  const originalFetch = global.fetch;
  process.env.AI_API_KEY = "test-provider-key";
  process.env.AI_API_URL = "https://provider.test/chat/completions";
  process.env.MOONLIT_MODEL_VERSION = "moonlit-brain-v4";
  global.fetch = async () => ({
    ok: false,
    status: 503,
    json: async () => ({ message: "provider unavailable" }),
  });
  const user = userModel.create({
    email: "failed-query@test.local",
    passwordHash: "hash",
  });

  try {
    await assert.rejects(
      answerMessage({
        userId: user.id,
        industry: "school",
        message: "Private failed question text",
        attachments: [],
      }),
      /AI provider request failed/,
    );
    const [failure] = await failedQueryModel.list();

    assert.equal(failure.userId, user.id);
    assert.equal(failure.industry, "school");
    assert.equal(failure.modelVersion, "moonlit-brain-v4");
    assert.equal(failure.errorType, "provider_error");
    assert.ok(failure.createdAt);
    assert.doesNotMatch(
      JSON.stringify(failure),
      /Private failed question text/,
    );
  } finally {
    if (originalKey === undefined) delete process.env.AI_API_KEY;
    else process.env.AI_API_KEY = originalKey;
    if (originalUrl === undefined) delete process.env.AI_API_URL;
    else process.env.AI_API_URL = originalUrl;
    if (originalVersion === undefined) delete process.env.MOONLIT_MODEL_VERSION;
    else process.env.MOONLIT_MODEL_VERSION = originalVersion;
    global.fetch = originalFetch;
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

test("users can group, search, and label exchanges as persistent threads", async () => {
  const owner = userModel.create({
    email: "threads@test.local",
    passwordHash: "hash",
  });
  const other = userModel.create({
    email: "other-threads@test.local",
    passwordHash: "hash",
  });
  const threadId = require("node:crypto").randomUUID();
  await conversationModel.create({
    userId: owner.id,
    industry: "school",
    intent: "general_support",
    modelVersion: "moonlit-brain-v1",
    message: "How does enrollment work?",
    reply: "Start with the application form.",
    threadId,
  });
  await conversationModel.create({
    userId: owner.id,
    industry: "school",
    intent: "admissions",
    modelVersion: "moonlit-brain-v1",
    message: "When is the deadline?",
    reply: "Please check with the admissions office.",
    threadId,
  });

  assert.equal(
    await conversationModel.setThreadLabel(owner.id, threadId, "Admissions"),
    true,
  );
  const [thread] = await conversationModel.listThreadsForUser(owner.id, {
    search: "deadline",
  });
  const otherThreads = await conversationModel.listThreadsForUser(other.id);

  assert.equal(thread.id, threadId);
  assert.equal(thread.title, "Admissions");
  assert.equal(thread.messages.length, 4);
  assert.equal(otherThreads.length, 0);
  assert.equal(
    await conversationModel.setThreadLabel(other.id, threadId, "Hijack"),
    false,
  );
});
