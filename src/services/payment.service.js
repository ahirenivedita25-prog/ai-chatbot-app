function createPaymentLink({ amount, currency = "USD", reference }) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("amount must be a positive number");
  }

  return {
    amount,
    currency,
    reference,
    status: "pending",
    url: `https://payments.example.test/checkout/${encodeURIComponent(reference)}`,
  };
}

module.exports = { createPaymentLink };
