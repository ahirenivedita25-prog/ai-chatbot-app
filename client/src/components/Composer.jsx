import { useEffect, useRef, useState } from "react";

const acceptedTypes = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
]);

export default function Composer({ onSend, busy }) {
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [fileError, setFileError] = useState("");
  const [listening, setListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const fileInput = useRef(null);
  const recognition = useRef(null);

  useEffect(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return undefined;
    const instance = new SpeechRecognition();
    instance.lang = navigator.language || "en-US";
    instance.continuous = false;
    instance.interimResults = false;
    instance.addEventListener("result", (event) => {
      const transcript = event.results[0][0].transcript.trim();
      if (transcript)
        setMessage((current) =>
          [current.trim(), transcript].filter(Boolean).join(" "),
        );
    });
    instance.addEventListener("start", () => setListening(true));
    instance.addEventListener("end", () => setListening(false));
    instance.addEventListener("error", () => setListening(false));
    recognition.current = instance;
    setVoiceSupported(true);
    return () => instance.abort();
  }, []);

  async function addFiles(fileList) {
    const next = [...files];
    setFileError("");
    for (const file of Array.from(fileList)) {
      if (next.length >= 4) {
        setFileError("Attach up to four files per message.");
        break;
      }
      if (!acceptedTypes.has(file.type)) {
        setFileError(`${file.name} is not a supported file type.`);
        continue;
      }
      if (file.size > 1024 * 1024) {
        setFileError(`${file.name} exceeds the 1 MB size limit.`);
        continue;
      }
      const content = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
        file.type.startsWith("image/")
          ? reader.readAsDataURL(file)
          : reader.readAsText(file);
      });
      next.push({
        name: file.name,
        type: file.type,
        ...(file.type.startsWith("image/")
          ? { data: content }
          : { text: String(content).slice(0, 30000) }),
      });
    }
    setFiles(next);
    if (fileInput.current) fileInput.current.value = "";
  }

  async function submit(event) {
    event.preventDefault();
    if (!message.trim() && !files.length) return;
    await onSend(message.trim(), files);
    setMessage("");
    setFiles([]);
  }

  return (
    <div className="composer-wrap">
      {files.length > 0 && (
        <div className="attachment-list" aria-live="polite">
          {files.map((file, index) => (
            <div className="attachment-chip" key={`${file.name}-${index}`}>
              <span>{file.name}</span>
              <button
                type="button"
                aria-label={`Remove ${file.name}`}
                onClick={() => setFiles(files.filter((_, i) => i !== index))}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      <form
        className={`composer ${dragging ? "composer-dragging" : ""}`}
        onSubmit={submit}
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes("Files")) {
            event.preventDefault();
            setDragging(true);
          }
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget))
            setDragging(false);
        }}
        onDrop={(event) => {
          if (!event.dataTransfer.files.length) return;
          event.preventDefault();
          setDragging(false);
          void addFiles(event.dataTransfer.files);
        }}
      >
        <input
          ref={fileInput}
          type="file"
          hidden
          multiple
          accept={[...acceptedTypes].join(",")}
          onChange={(event) => void addFiles(event.target.files)}
        />
        <button
          className="icon-control"
          type="button"
          aria-label="Attach files"
          onClick={() => fileInput.current?.click()}
          title="Attach files"
        >
          ＋
        </button>
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          rows={1}
          maxLength={4000}
          placeholder="Message Moonlit…"
          aria-label="Your message"
          disabled={busy}
        />
        <div className="composer-actions">
          <button
            className={`icon-control ${listening ? "listening" : ""}`}
            type="button"
            aria-label={listening ? "Stop voice input" : "Start voice input"}
            title={listening ? "Stop voice input" : "Dictate message"}
            disabled={busy || !voiceSupported}
            onClick={() => {
              if (listening) recognition.current?.stop();
              else {
                try {
                  recognition.current?.start();
                } catch {
                  setFileError("Voice input is already active.");
                }
              }
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="9" y="3" width="6" height="12" rx="3" />
              <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 18v3m-4 0h8" />
            </svg>
          </button>
          <button
            className="send-button icon-control"
            type="submit"
            disabled={busy || (!message.trim() && !files.length)}
            aria-label="Send message"
          >
            <span>Send</span>
            <strong>↑</strong>
          </button>
        </div>
      </form>
      {fileError && (
        <p className="error-text" role="status">
          {fileError}
        </p>
      )}
      <p className="composer-caption">
        Attachments are scanned before processing.
      </p>
    </div>
  );
}
