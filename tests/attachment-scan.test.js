const test = require("node:test");
const assert = require("node:assert/strict");
const net = require("node:net");
const { scanAttachments } = require("../src/services/attachment-scan.service");

function withScanner(response, run) {
  const server = net.createServer((socket) => {
    socket.on("data", (chunk) => {
      if (chunk.length >= 4 && chunk.subarray(-4).every((byte) => byte === 0)) {
        socket.end(response);
      }
    });
  });
  return new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", async () => {
      const oldHost = process.env.CLAMAV_HOST;
      const oldPort = process.env.CLAMAV_PORT;
      process.env.CLAMAV_HOST = "127.0.0.1";
      process.env.CLAMAV_PORT = String(server.address().port);
      try {
        await run();
        resolve();
      } catch (error) {
        reject(error);
      } finally {
        if (oldHost === undefined) delete process.env.CLAMAV_HOST;
        else process.env.CLAMAV_HOST = oldHost;
        if (oldPort === undefined) delete process.env.CLAMAV_PORT;
        else process.env.CLAMAV_PORT = oldPort;
        server.close();
      }
    });
  });
}

test("attachment scanner accepts files marked clean by ClamAV", async () => {
  await withScanner("stream: OK\n", () =>
    scanAttachments([{ name: "note.txt", type: "text/plain", text: "hello" }]),
  );
});

test("attachment scanner rejects files detected as malware", async () => {
  await withScanner("stream: Eicar-Test-Signature FOUND\n", async () => {
    await assert.rejects(
      scanAttachments([
        { name: "note.txt", type: "text/plain", text: "malicious" },
      ]),
      /Malware detected/,
    );
  });
});

test("production attachment processing fails closed without a scanner", async () => {
  const oldMode = process.env.NODE_ENV;
  const oldHost = process.env.CLAMAV_HOST;
  process.env.NODE_ENV = "production";
  delete process.env.CLAMAV_HOST;
  try {
    await assert.rejects(
      scanAttachments([
        { name: "note.txt", type: "text/plain", text: "hello" },
      ]),
      /scanner is required/,
    );
  } finally {
    if (oldMode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = oldMode;
    if (oldHost !== undefined) process.env.CLAMAV_HOST = oldHost;
  }
});
