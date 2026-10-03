const defaultApiUrl = "https://api.openai.com/v1/chat/completions";
const assistantName = process.env.AI_ASSISTANT_NAME || "moonlit";
const { classifyIntent } = require("./intent.service");
const { getWeatherReply } = require("./weather.service");

const industryGuidance = {
  school: "school fees, schedules, admissions, and family support",
  clinic: "appointments, services, opening hours, and patient support",
  retail: "products, orders, delivery, returns, and customer support",
  restaurant: "menus, reservations, opening hours, and dining support",
};

function fallbackReply(industry) {
  return `${industry[0].toUpperCase()}${industry.slice(1)} support is not configured yet. Configure AI_API_KEY to get answers about ${industryGuidance[industry]}.`;
}

function collectPlainText(value, key = "") {
  if (/reasoning/i.test(key)) return [];
  if (typeof value === "string") return value.trim() ? [value.trim()] : [];
  if (typeof value === "number" || typeof value === "boolean") {
    return [String(value)];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectPlainText(item));
  }
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([childKey, child]) =>
      collectPlainText(child, childKey),
    );
  }
  return [];
}

function plainTextReply(content) {
  const cleaned = content
    .replace(/^```(?:text|json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  try {
    // Flatten legacy JSON replies instead of exposing their serialized form.
    return (
      collectPlainText(JSON.parse(cleaned)).join("\n\n") ||
      "I couldn't produce a readable answer. Please try asking again."
    );
  } catch {
    return cleaned;
  }
}

function createUserContent(message, attachments) {
  const imageAttachments = attachments.filter((file) =>
    file.type?.startsWith("image/"),
  );
  const textContext = attachments
    .filter(
      (file) =>
        (file.type?.startsWith("text/") || file.type === "application/json") &&
        typeof file.text === "string",
    )
    .map(
      (file) =>
        `\n\nAttached text file (${file.name}):\n${file.text.slice(0, 30000)}`,
    )
    .join("");
  const text = `${message || "Please review the attached file(s)."}${textContext}`;

  if (!imageAttachments.length) return text;
  return [
    { type: "text", text },
    ...imageAttachments.map((file) => ({
      type: "image_url",
      image_url: { url: file.data },
    })),
  ];
}

async function generateReply({
  industry,
  message,
  attachments = [],
  transport = fetch,
}) {
  if (classifyIntent(message) === "weather") {
    return getWeatherReply({
      message,
      isForecast: /\bforecast\b/i.test(message),
      transport,
    });
  }

  const apiKey = process.env.AI_API_KEY;
  if (!apiKey) return fallbackReply(industry);

  const userContent = createUserContent(message, attachments);

  const response = await transport(process.env.AI_API_URL || defaultApiUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.AI_MODEL || "gpt-4o-mini",
      temperature: 0.2,
      max_tokens: 700,
      messages: [
        {
          role: "system",
          content: `You are ${assistantName}, a helpful multi-source assistant serving the ${industry} desk. Help with ${industryGuidance[industry]}, but answer any question the user asks. First infer the user's intent and context, then choose the clearest concise format: short paragraphs for simple answers, bullets for grouped points, numbered steps for procedures, aligned plain-text tables for comparisons, and compact text bar charts for numerical data. For location-based requests, present results as a structured list with a distinct icon per result when the source provides enough detail. Use only information available in the user's message, attachments, or your reliable general knowledge; do not claim to have browsed or verified external sources. Identify uncertainty and attribute details to supplied sources when useful. Format for a plain-text chat bubble: do not return JSON, Markdown tables, or code fences; use readable labels and spacing, and use simple text bars (for example, ███) rather than graphical charts. Keep answers clear, useful, and professional without defaulting to long paragraphs. Never invent private account, payment, medical, legal, location, or appointment details; explain what information is missing or direct the user to staff when an answer requires private or live data.`,
        },
        { role: "user", content: userContent },
      ],
    }),
  });

  if (!response.ok) {
    let providerMessage = "";
    try {
      const errorBody = await response.json();
      providerMessage = errorBody.error?.message || errorBody.message || "";
    } catch {
      providerMessage = "";
    }
    console.error("AI provider request failed", {
      status: response.status,
      message: providerMessage,
      model: process.env.AI_MODEL || "gpt-4o-mini",
      url: process.env.AI_API_URL || defaultApiUrl,
    });
    throw new Error(
      `AI provider request failed with status ${response.status}`,
    );
  }

  const body = await response.json();
  const reply = body.choices?.[0]?.message?.content?.trim();
  if (!reply) throw new Error("AI provider returned an empty response");
  return plainTextReply(reply);
}

module.exports = { generateReply };
