const { generateReply } = require("./chatbot.service");
const { scanAttachments } = require("./attachment-scan.service");
const { classifyIntent } = require("./intent.service");
const conversationModel = require("../models/conversation.model");
const failedQueryModel = require("../models/failed-query.model");

function modelVersion() {
  const configured = process.env.MOONLIT_MODEL_VERSION;
  return /^moonlit-brain-v\d+$/.test(configured || "")
    ? configured
    : "moonlit-brain-v1";
}

function sanitizeMessage(value) {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim();
}

function sanitizeAttachments(attachments) {
  return attachments.map((attachment) => ({
    ...attachment,
    name: attachment.name.replace(/[\\/\u0000-\u001F]/g, "_").slice(0, 160),
    ...(typeof attachment.text === "string"
      ? {
          text: attachment.text
            .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
            .slice(0, 30000),
        }
      : {}),
  }));
}

async function answerMessage({ userId, industry, message, attachments }) {
  const safeMessage = sanitizeMessage(message);
  const safeAttachments = sanitizeAttachments(attachments);
  await scanAttachments(safeAttachments);

  const version = modelVersion();
  let reply;
  try {
    reply = await generateReply({
      industry,
      message: safeMessage,
      attachments: safeAttachments,
    });
  } catch (error) {
    const errorType = /empty response/i.test(error.message)
      ? "empty_response"
      : "provider_error";
    try {
      await failedQueryModel.create({
        userId,
        industry,
        modelVersion: version,
        errorType,
      });
    } catch (logError) {
      console.error("Failed to record inference failure", logError);
    }
    throw error;
  }
  const intent = classifyIntent(
    `${safeMessage} ${safeAttachments.map((file) => file.name).join(" ")}`,
  );
  const conversation = await conversationModel.create({
    userId,
    industry,
    intent,
    modelVersion: version,
    message: safeMessage,
    reply,
  });

  return {
    industry,
    reply,
    modelVersion: version,
    conversationId: conversation.id,
  };
}

module.exports = {
  answerMessage,
  modelVersion,
  sanitizeMessage,
  sanitizeAttachments,
};
