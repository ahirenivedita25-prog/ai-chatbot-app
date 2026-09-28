const defaultApiUrl = "https://api.openai.com/v1/chat/completions";

const industryGuidance = {
  school: "school fees, schedules, admissions, and family support",
  clinic: "appointments, services, opening hours, and patient support",
  retail: "products, orders, delivery, returns, and customer support",
  restaurant: "menus, reservations, opening hours, and dining support",
};

function fallbackReply(industry) {
  return {
    summary: `${industry[0].toUpperCase()}${industry.slice(1)} support is not configured yet.`,
    details: [
      `Configure AI_API_KEY to get answers about ${industryGuidance[industry]}.`,
    ],
    nextSteps: [],
    caveat: "This is a prototype response.",
  };
}

function structuredReply(content) {
  const cleaned = content
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned);
    if (typeof parsed.summary !== "string" || !parsed.summary.trim()) {
      throw new Error("Structured response is missing summary");
    }
    return {
      summary: parsed.summary.trim(),
      details: Array.isArray(parsed.details)
        ? parsed.details.filter((item) => typeof item === "string").slice(0, 5)
        : [],
      nextSteps: Array.isArray(parsed.nextSteps)
        ? parsed.nextSteps
            .filter((item) => typeof item === "string")
            .slice(0, 5)
        : [],
      caveat: typeof parsed.caveat === "string" ? parsed.caveat.trim() : "",
    };
  } catch {
    return {
      summary: cleaned,
      details: [],
      nextSteps: [],
      caveat: "",
    };
  }
}

async function generateReply({ industry, message, transport = fetch }) {
  const apiKey = process.env.AI_API_KEY;
  if (!apiKey) return fallbackReply(industry);

  const response = await transport(process.env.AI_API_URL || defaultApiUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.AI_MODEL || "gpt-4o-mini",
      temperature: 0.2,
      max_tokens: 400,
      messages: [
        {
          role: "system",
          content: `You are the ${industry} support assistant. Help with ${industryGuidance[industry]}. Return ONLY valid JSON with this exact shape: {"summary":"one direct answer","details":["supporting fact"],"nextSteps":["action the user can take"],"caveat":"short limitation or empty string"}. Keep each item concise and use empty arrays when a section is not useful. Tailor every field to the user's question. Do not invent account, payment, medical, legal, or appointment details. Say what information is needed or direct the user to staff when the answer requires private or live data.`,
        },
        { role: "user", content: message },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(
      `AI provider request failed with status ${response.status}`,
    );
  }

  const body = await response.json();
  const reply = body.choices?.[0]?.message?.content?.trim();
  if (!reply) throw new Error("AI provider returned an empty response");
  return structuredReply(reply);
}

module.exports = { generateReply };
