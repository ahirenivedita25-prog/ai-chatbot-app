const { scanAttachments } = require("./attachment-scan.service");

const prompts = {
  upscale_sharpen:
    "Upscale this image while preserving its composition and subject. Improve fine detail and sharpness naturally without adding objects or changing identity.",
  background_cleanup:
    "Clean up and remove the background while preserving the main subject with clean, natural edges. Return a transparent background where supported.",
  sketch:
    "Transform this image into a polished hand-drawn sketch. Preserve the main subject, composition, and recognizable details.",
  professional:
    "Transform this image into a polished professional editorial photograph. Preserve the subject and composition; use restrained, natural lighting and color.",
  creative:
    "Create a distinctive creative-art interpretation of this image while keeping the main subject recognizable and preserving its core composition.",
};

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

async function enhanceImage({ image, style }) {
  if (!process.env.IMAGE_API_URL || !process.env.IMAGE_API_KEY) {
    fail(503, "AI image enhancement is not configured for this workspace");
  }
  if (!Object.hasOwn(prompts, style)) {
    fail(400, "Choose a supported image enhancement style");
  }
  if (!image || typeof image.data !== "string") {
    fail(400, "Choose an image to enhance");
  }
  const match = image.data.match(
    /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/,
  );
  if (!match) fail(400, "Image must be a PNG, JPEG, or WebP data URL");
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.length > 1024 * 1024) {
    fail(400, "Image must be no larger than 1 MB");
  }

  const attachment = {
    name: String(image.name || "image")
      .replace(/[\\/\u0000-\u001F]/g, "_")
      .slice(0, 160),
    type: match[1],
    data: image.data,
  };
  await scanAttachments([attachment]);

  const form = new FormData();
  form.set("model", process.env.IMAGE_MODEL || "gpt-image-1");
  form.set("prompt", prompts[style]);
  form.set("size", "auto");
  form.set("image", new Blob([bytes], { type: match[1] }), attachment.name);

  let response;
  try {
    response = await fetch(process.env.IMAGE_API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.IMAGE_API_KEY}` },
      body: form,
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    fail(502, "AI image enhancement provider is unavailable");
  }

  if (!response.ok) {
    fail(502, "AI image enhancement provider rejected the request");
  }
  let result;
  try {
    result = await response.json();
  } catch {
    fail(502, "AI image enhancement provider returned an invalid response");
  }
  const encoded = result?.data?.[0]?.b64_json;
  if (
    typeof encoded !== "string" ||
    encoded.length > 14 * 1024 * 1024 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)
  ) {
    fail(502, "AI image enhancement provider returned no usable image");
  }

  return {
    name: `enhanced-${attachment.name.replace(/\.[^.]+$/, "")}.png`,
    type: "image/png",
    data: `data:image/png;base64,${encoded}`,
  };
}

module.exports = { enhanceImage, styles: Object.keys(prompts) };
