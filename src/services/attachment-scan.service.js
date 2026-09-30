const net = require("node:net");

function attachmentBytes(attachment) {
  if (attachment.data) {
    const encoded = attachment.data.split(",", 2)[1];
    return Buffer.from(encoded, "base64");
  }
  return Buffer.from(attachment.text || "", "utf8");
}

function scanWithClamAv(attachment, { host, port }) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    const responseChunks = [];
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      error ? reject(error) : resolve();
    };

    socket.setTimeout(10_000, () =>
      finish(new Error("Malware scan timed out")),
    );
    socket.on("error", () => finish(new Error("Malware scanner unavailable")));
    socket.on("data", (chunk) => responseChunks.push(chunk));
    socket.on("end", () => {
      const response = Buffer.concat(responseChunks).toString("utf8");
      if (/FOUND\s*$/.test(response))
        return finish(new Error("Malware detected"));
      if (/OK\s*$/.test(response)) return finish();
      finish(new Error("Malware scanner returned an invalid response"));
    });
    socket.on("connect", () => {
      const bytes = attachmentBytes(attachment);
      const size = Buffer.alloc(4);
      size.writeUInt32BE(bytes.length);
      socket.write("zINSTREAM\0");
      socket.write(size);
      socket.write(bytes);
      socket.end(Buffer.alloc(4));
    });
  });
}

async function scanAttachments(attachments) {
  if (!attachments.length) return;
  const host = process.env.CLAMAV_HOST;
  const port = Number(process.env.CLAMAV_PORT || 3310);
  if (!host) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Malware scanner is required before file processing");
    }
    return;
  }
  await Promise.all(
    attachments.map((attachment) => scanWithClamAv(attachment, { host, port })),
  );
}

module.exports = { scanAttachments };
