const config = {
  apiUrl: process.env.WHATSAPP_API_URL || "https://graph.facebook.com",
  token: process.env.WHATSAPP_API_TOKEN,
  phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
};

async function sendMessage({ to, body, transport = fetch }) {
  if (!config.token || !config.phoneNumberId) {
    return { queued: true, provider: "not-configured", to, body };
  }

  const response = await transport(
    `${config.apiUrl}/${config.phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body },
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`WhatsApp request failed with status ${response.status}`);
  }

  return response.json();
}

module.exports = { sendMessage };
