const defaultApiUrl = "https://api.openai.com/v1/chat/completions";
const assistantName = process.env.AI_ASSISTANT_NAME || "moonlit";

const industryGuidance = {
  school: "school fees, schedules, admissions, and family support",
  clinic: "appointments, services, opening hours, and patient support",
  retail: "products, orders, delivery, returns, and customer support",
  restaurant: "menus, reservations, opening hours, and dining support",
};

function fallbackReply(industry) {
  return {
    summary: `${industry[0].toUpperCase()}${industry.slice(1)} support is not configured yet.`,
    reasoning: "The shared AI provider is not configured for this deployment.",
    details: [
      `Configure AI_API_KEY to get answers about ${industryGuidance[industry]}.`,
    ],
    nextSteps: [],
    caveat: "The AI provider is not connected yet.",
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
      reasoning:
        typeof parsed.reasoning === "string" ? parsed.reasoning.trim() : "",
      details: Array.isArray(parsed.details)
        ? parsed.details.filter((item) => typeof item === "string").slice(0, 5)
        : [],
      nextSteps: Array.isArray(parsed.nextSteps)
        ? parsed.nextSteps
            .filter((item) => typeof item === "string")
            .slice(0, 5)
        : [],
      caveat: typeof parsed.caveat === "string" ? parsed.caveat.trim() : "",
      table: normalizeTable(parsed.table),
      chart: normalizeChart(parsed.chart),
    };
  } catch {
    return {
      summary: cleaned,
      reasoning: "The provider returned a plain-text answer.",
      details: [],
      nextSteps: [],
      caveat: "",
      table: null,
      chart: null,
    };
  }
}

function normalizeTable(table) {
  if (
    !table ||
    !Array.isArray(table.columns) ||
    !Array.isArray(table.rows) ||
    table.columns.length === 0
  )
    return null;
  const columns = table.columns
    .slice(0, 6)
    .map((value) => String(value).slice(0, 80));
  const rows = table.rows
    .slice(0, 12)
    .map((row) =>
      columns.map((_, index) => String(row?.[index] ?? "").slice(0, 240)),
    );
  return { title: String(table.title || "Data").slice(0, 80), columns, rows };
}

function normalizeChart(chart) {
  if (
    !chart ||
    chart.type !== "bar" ||
    !Array.isArray(chart.labels) ||
    !Array.isArray(chart.values) ||
    chart.labels.length === 0 ||
    chart.labels.length !== chart.values.length
  )
    return null;
  const values = chart.values.slice(0, 8).map(Number);
  if (values.some((value) => !Number.isFinite(value) || value < 0)) return null;
  return {
    type: "bar",
    title: String(chart.title || "Overview").slice(0, 80),
    labels: chart.labels.slice(0, 8).map((value) => String(value).slice(0, 32)),
    values,
  };
}

async function generateReply({
  industry,
  message,
  attachments = [],
  transport = fetch,
}) {
  const apiKey = process.env.AI_API_KEY;
  if (!apiKey) return fallbackReply(industry);

  // Use multimodal content only when the user attached an image.
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
  const userText = `${message || "Please review the attached file(s)."}${textContext}`;
  const userContent = imageAttachments.length
    ? [
        { type: "text", text: userText },
        ...imageAttachments.map((file) => ({
          type: "image_url",
          image_url: { url: file.data },
        })),
      ]
    : userText;

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
          content: `You are ${assistantName}, one shared AI support assistant serving the ${industry} desk. Help with ${industryGuidance[industry]}. Return ONLY valid JSON with this exact shape: {"summary":"one direct answer","reasoning":"one brief rationale, never private chain-of-thought","details":["supporting fact"],"nextSteps":["action the user can take"],"caveat":"short limitation or empty string","table":null,"chart":null}. When useful and supported by the question or attachments, table may be {"title":"...","columns":["..."],"rows":[["..."]]}; chart may be {"type":"bar","title":"...","labels":["..."],"values":[1]}. Do not invent numerical data just to create a chart. Keep concise and use null/empty arrays when sections are not useful. Tailor every field to the user's question and attachments. Do not invent account, payment, medical, legal, or appointment details. Say what information is needed or direct the user to staff when the answer requires private or live data.`,
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
  return structuredReply(reply);
}

module.exports = { generateReply };
