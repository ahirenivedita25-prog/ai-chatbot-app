const intentRules = [
  ["weather", /\b(?:weather|temperature|forecast)\b/i],
  ["billing", /fee|tuition|bill|invoice|payment|refund/i],
  ["appointment", /appointment|book|schedule|visit|availability/i],
  ["order", /order|delivery|shipping|return|product|purchase/i],
  ["hours", /hours|open|close|when do you/i],
  ["admissions", /admission|enroll|apply|application|registration/i],
];

function classifyIntent(text) {
  const match = intentRules.find(([, pattern]) => pattern.test(text));
  return match?.[0] || "general_support";
}

module.exports = { classifyIntent };
