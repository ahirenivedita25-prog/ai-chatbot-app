import { useEffect, useRef, useState } from "react";

export default function AdminMenu({ onLogout, apiRequest }) {
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState("");
  const [settings, setSettings] = useState(null);
  const [help, setHelp] = useState(null);
  const root = useRef(null);

  useEffect(() => {
    function dismiss(event) {
      if (!root.current?.contains(event.target)) setOpen(false);
      if (event.key === "Escape") {
        setOpen(false);
        setPanel("");
      }
    }
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", dismiss);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", dismiss);
    };
  }, []);

  async function showPanel(name) {
    setOpen(false);
    setPanel(name);
    const response = await apiRequest(`/api/admin/${name}`);
    if (response.ok) {
      const data = await response.json();
      name === "settings" ? setSettings(data) : setHelp(data);
    }
  }

  return (
    <div className="menu-root" ref={root}>
      <button
        className="menu-trigger"
        type="button"
        aria-label="Admin workspace options"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        •••
      </button>
      {open && (
        <div className="menu-popover" role="menu">
          <button role="menuitem" onClick={() => void showPanel("settings")}>
            Settings
          </button>
          <button role="menuitem" onClick={() => void showPanel("help")}>
            Help
          </button>
          <button role="menuitem" className="menu-danger" onClick={onLogout}>
            Logout
          </button>
        </div>
      )}
      {panel && (
        <div
          className="dialog-backdrop"
          role="presentation"
          onClick={() => setPanel("")}
        >
          <section
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dialog-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="dialog-header">
              <h2 id="dialog-title">
                {panel === "settings" ? "Workspace settings" : "Moonlit help"}
              </h2>
              <button
                className="icon-control"
                onClick={() => setPanel("")}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            {panel === "settings" ? (
              settings ? (
                <dl className="settings-list">
                  <dt>Assistant model</dt>
                  <dd>{settings.modelVersion}</dd>
                  <dt>Access session</dt>
                  <dd>{settings.sessionMinutes} minutes</dd>
                  <dt>Attachment scanning</dt>
                  <dd>
                    {settings.attachmentScanning ? "Enabled" : "Unavailable"}
                  </dd>
                </dl>
              ) : (
                <p>Loading settings…</p>
              )
            ) : help ? (
              <ul>
                {help.topics.map((topic) => (
                  <li key={topic}>{topic}</li>
                ))}
              </ul>
            ) : (
              <p>Loading help…</p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
