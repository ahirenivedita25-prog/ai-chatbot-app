function requireFields(payload, fields) {
  const missing = fields.filter((field) => {
    const value = payload?.[field];
    return value === undefined || value === null || value === "";
  });

  return missing;
}

function validateMessage(payload) {
  const message = payload?.message;
  const attachments = payload?.attachments ?? [];
  if (typeof message !== "string" || message.length > 4000) {
    return {
      valid: false,
      error: "message must be a string of at most 4000 characters",
    };
  }

  if (!Array.isArray(attachments) || attachments.length > 4) {
    return { valid: false, error: "Attach up to 4 supported files" };
  }
  if (!message.trim() && attachments.length === 0) {
    return { valid: false, error: "Add a message or attach a file" };
  }

  let totalDataSize = 0;
  for (const attachment of attachments) {
    if (
      typeof attachment?.name !== "string" ||
      attachment.name.length > 160 ||
      typeof attachment.type !== "string"
    ) {
      return { valid: false, error: "Attachment metadata is invalid" };
    }
    if (attachment.type.startsWith("image/")) {
      if (
        !/^data:image\/(png|jpeg|webp);base64,[a-z\d+/]+=*$/i.test(
          attachment.data || "",
        )
      ) {
        return {
          valid: false,
          error: "Images must be PNG, JPEG, or WebP files",
        };
      }
      totalDataSize += attachment.data.length;
    } else if (
      (attachment.type.startsWith("text/") ||
        attachment.type === "application/json") &&
      typeof attachment.text === "string" &&
      attachment.text.length <= 30000
    ) {
      totalDataSize += attachment.text.length;
    } else {
      return {
        valid: false,
        error: "Only supported image and text files are allowed",
      };
    }
  }
  if (totalDataSize > 6_000_000) {
    return {
      valid: false,
      error: "Combined attachment size exceeds the limit",
    };
  }

  return { valid: true };
}

module.exports = { requireFields, validateMessage };
