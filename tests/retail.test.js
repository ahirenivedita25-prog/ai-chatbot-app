const test = require("node:test");
const assert = require("node:assert/strict");
const { createPaymentLink } = require("../src/services/payment.service");

test("retail payment service creates a checkout link", () => {
  const payment = createPaymentLink({ amount: 25, reference: "order-123" });
  assert.equal(payment.status, "pending");
  assert.match(payment.url, /order-123/);
});

test("payment service rejects invalid amounts", () => {
  assert.throws(
    () => createPaymentLink({ amount: 0, reference: "order-123" }),
    /positive number/,
  );
});
