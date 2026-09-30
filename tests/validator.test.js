const test = require("node:test");
const assert = require("node:assert/strict");
const { validateMessage } = require("../src/utils/validator");

test("message validation accepts supported image attachments", () => {
  const result = validateMessage({
    message: "What is shown here?",
    attachments: [
      {
        name: "photo.png",
        type: "image/png",
        data: `data:image/png;base64,${"a".repeat(100)}`,
      },
    ],
  });
  assert.equal(result.valid, true);
});

test("message validation accepts text attachments without a typed question", () => {
  const result = validateMessage({
    message: "",
    attachments: [
      { name: "notes.json", type: "application/json", text: '{"count":3}' },
    ],
  });
  assert.equal(result.valid, true);
});

test("message validation rejects unsupported and oversized attachments", () => {
  assert.equal(
    validateMessage({
      message: "Review this file",
      attachments: [{ name: "script.exe", type: "application/octet-stream" }],
    }).valid,
    false,
  );
  assert.equal(
    validateMessage({
      message: "",
      attachments: [{ name: "x.png", type: "image/png", data: "nope" }],
    }).valid,
    false,
  );
});
