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

export default function Composer({ onSend, busy, apiRequest }) {
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [fileError, setFileError] = useState("");
  const [listening, setListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [cloudProvider, setCloudProvider] = useState(() => {
    const provider = new URLSearchParams(window.location.search).get(
      "connected",
    );
    return ["google", "microsoft"].includes(provider) ? provider : "";
  });
  const [cloudFiles, setCloudFiles] = useState([]);
  const [cloudQuery, setCloudQuery] = useState("");
  const [appliedCloudQuery, setAppliedCloudQuery] = useState("");
  const [cloudBusy, setCloudBusy] = useState(false);
  const [cloudError, setCloudError] = useState("");
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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has("connected")) return;
    params.delete("connected");
    const query = params.toString();
    window.history.replaceState(
      {},
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`,
    );
  }, []);

  useEffect(() => {
    if (!cloudProvider) return undefined;
    let active = true;
    setCloudBusy(true);
    setCloudError("");
    const search = appliedCloudQuery
      ? `?q=${encodeURIComponent(appliedCloudQuery)}`
      : "";
    apiRequest(`/api/integrations/${cloudProvider}/files${search}`)
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.error || "Could not list cloud files");
        if (active) setCloudFiles(result.files);
      })
      .catch((error) => {
        if (active) setCloudError(error.message);
      })
      .finally(() => {
        if (active) setCloudBusy(false);
      });
    return () => {
      active = false;
    };
  }, [apiRequest, appliedCloudQuery, cloudProvider]);

  async function connectCloud() {
    setCloudBusy(true);
    setCloudError("");
    try {
      const response = await apiRequest(
        `/api/integrations/${cloudProvider}/connect`,
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Could not connect cloud drive");
      window.location.assign(result.authorizationUrl);
    } catch (error) {
      setCloudError(error.message);
      setCloudBusy(false);
    }
  }

  async function importCloudFile(file) {
    setCloudBusy(true);
    setCloudError("");
    try {
      const response = await apiRequest(
        `/api/integrations/${cloudProvider}/files/${encodeURIComponent(file.id)}`,
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Could not import file");
      if (files.length >= 4)
        throw new Error("Attach up to four files per message.");
      setFiles((current) => [...current, result.file]);
      setCloudProvider("");
    } catch (error) {
      setCloudError(error.message);
    } finally {
      setCloudBusy(false);
    }
  }

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

  async function runQuickAction(action) {
    if (action === "summarize" && files.length) {
      await onSend(
        "Summarize the attached file. Give me the key points and any important dates or figures.",
        files,
        action,
      );
      setMessage("");
      setFiles([]);
      return;
    }
    const prompts = {
      summarize: "Summarize the following text in concise bullet points:\n",
      report:
        "Create a concise report from the following context. Include a title, key findings, and recommended next steps:\n",
      translate:
        "Translate the following text into English, preserving its meaning and tone:\n",
    };
    setMessage((current) => `${prompts[action]}${current}`);
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
      <div className="quick-actions" aria-label="Quick actions">
        <button
          type="button"
          disabled={busy}
          onClick={() => runQuickAction("summarize")}
        >
          Summarize file
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => runQuickAction("report")}
        >
          Generate report
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => runQuickAction("translate")}
        >
          Translate text
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setCloudFiles([]);
            setCloudError("");
            setCloudQuery("");
            setAppliedCloudQuery("");
            setCloudProvider("google");
          }}
        >
          Import from Drive
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setCloudFiles([]);
            setCloudError("");
            setCloudQuery("");
            setAppliedCloudQuery("");
            setCloudProvider("microsoft");
          }}
        >
          Import from OneDrive
        </button>
      </div>
      <p className="composer-caption">
        Attachments are scanned before processing.
      </p>
      {cloudProvider && (
        <div
          className="dialog-backdrop"
          role="presentation"
          onClick={() => setCloudProvider("")}
        >
          <section
            className="dialog cloud-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cloud-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="dialog-header">
              <h2 id="cloud-title">
                Import from{" "}
                {cloudProvider === "google" ? "Google Drive" : "OneDrive"}
              </h2>
              <button
                className="icon-control"
                type="button"
                aria-label="Close cloud file picker"
                onClick={() => setCloudProvider("")}
              >
                ×
              </button>
            </div>
            <form
              className="cloud-search"
              onSubmit={(event) => {
                event.preventDefault();
                setAppliedCloudQuery(cloudQuery.trim());
              }}
            >
              <input
                aria-label="Search cloud files"
                value={cloudQuery}
                onChange={(event) => setCloudQuery(event.target.value)}
                placeholder="Search files"
                maxLength={120}
              />
              <button type="submit" disabled={cloudBusy}>
                Search
              </button>
            </form>
            {cloudError && (
              <p className="error-text" role="alert">
                {cloudError}
              </p>
            )}
            {cloudError.toLowerCase().includes("connect") ||
            cloudError.toLowerCase().includes("oauth is not configured") ? (
              <button
                className="button-primary cloud-connect"
                type="button"
                disabled={cloudBusy}
                onClick={() => void connectCloud()}
              >
                {cloudBusy
                  ? "Connecting…"
                  : `Connect ${cloudProvider === "google" ? "Google Drive" : "OneDrive"}`}
              </button>
            ) : null}
            <div className="cloud-file-list" aria-live="polite">
              {cloudBusy ? (
                <p className="muted">Loading files…</p>
              ) : (
                cloudFiles.map((file) => (
                  <button
                    className="cloud-file"
                    type="button"
                    key={file.id}
                    disabled={cloudBusy}
                    onClick={() => void importCloudFile(file)}
                  >
                    <span>{file.name}</span>
                    <small>
                      {file.type} ·{" "}
                      {file.modifiedAt
                        ? new Date(file.modifiedAt).toLocaleDateString()
                        : "Cloud file"}
                    </small>
                  </button>
                ))
              )}
              {!cloudBusy && !cloudError && !cloudFiles.length && (
                <p className="muted">No supported text files found.</p>
              )}
            </div>
            <p className="composer-caption">
              Text, Markdown, CSV, and JSON files up to 1 MB are supported.
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
