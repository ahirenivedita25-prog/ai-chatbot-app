import { useEffect, useRef, useState } from "react";

export default function AdminMenu({ onLogout, apiRequest }) {
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState("");
  const [settings, setSettings] = useState(null);
  const [help, setHelp] = useState(null);
  const [integrations, setIntegrations] = useState(null);
  const [integrationProvider, setIntegrationProvider] = useState("jira");
  const [integrationQuery, setIntegrationQuery] = useState("");
  const [integrationResults, setIntegrationResults] = useState([]);
  const [integrationBusy, setIntegrationBusy] = useState(false);
  const [integrationError, setIntegrationError] = useState("");
  const [audit, setAudit] = useState(null);
  const [analytics, setAnalytics] = useState(null);
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
      if (name === "settings") setSettings(data);
      else if (name === "help") setHelp(data);
      else if (name === "integrations") setIntegrations(data.integrations);
      else if (name === "audit") setAudit(data.events);
      else if (name === "analytics") setAnalytics(data);
    }
  }

  async function searchIntegration(event) {
    event.preventDefault();
    setIntegrationBusy(true);
    setIntegrationError("");
    setIntegrationResults([]);
    try {
      const response = await apiRequest(
        `/api/integrations/${integrationProvider}/search`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: integrationQuery }),
        },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Integration search failed");
      setIntegrationResults(result.results);
    } catch (error) {
      setIntegrationError(error.message);
    } finally {
      setIntegrationBusy(false);
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
          <button
            role="menuitem"
            onClick={() => void showPanel("integrations")}
          >
            Integrations
          </button>
          <button role="menuitem" onClick={() => void showPanel("audit")}>
            Activity log
          </button>
          <button role="menuitem" onClick={() => void showPanel("analytics")}>
            Analytics
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
                {
                  {
                    settings: "Workspace settings",
                    help: "Moonlit help",
                    integrations: "Integrations",
                    audit: "Activity log",
                    analytics: "Usage analytics",
                  }[panel]
                }
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
                  <dt>AI image enhancement</dt>
                  <dd>
                    {settings.imageEnhancement ? "Enabled" : "Not configured"}
                  </dd>
                </dl>
              ) : (
                <p>Loading settings…</p>
              )
            ) : panel === "integrations" ? (
              integrations ? (
                <>
                  <ul className="integration-list">
                    {integrations.map((integration) => (
                      <li key={integration.name}>
                        <strong>{integration.name}</strong>
                        <span
                          className={
                            integration.configured
                              ? "integration-ready"
                              : "integration-pending"
                          }
                        >
                          {integration.configured
                            ? "Credentials configured"
                            : "Needs credentials"}
                        </span>
                        <small>{integration.setup}</small>
                      </li>
                    ))}
                  </ul>
                  <form
                    className="integration-search-form"
                    onSubmit={searchIntegration}
                  >
                    <label htmlFor="integration-provider">
                      Search connected workspace
                    </label>
                    <div>
                      <select
                        id="integration-provider"
                        value={integrationProvider}
                        onChange={(event) =>
                          setIntegrationProvider(event.target.value)
                        }
                      >
                        <option value="jira">Jira</option>
                        <option value="confluence">Confluence</option>
                        <option value="slack">Slack</option>
                      </select>
                      <input
                        aria-label="Search integrations"
                        value={integrationQuery}
                        onChange={(event) =>
                          setIntegrationQuery(event.target.value)
                        }
                        placeholder="Search issues, pages, or messages"
                        maxLength={200}
                        required
                      />
                      <button type="submit" disabled={integrationBusy}>
                        {integrationBusy ? "Searching…" : "Search"}
                      </button>
                    </div>
                  </form>
                  {integrationError && (
                    <p className="error-text" role="alert">
                      {integrationError}
                    </p>
                  )}
                  <ul className="integration-results" aria-live="polite">
                    {integrationResults.map((result) => (
                      <li key={`${integrationProvider}-${result.id}`}>
                        {result.url ? (
                          <a href={result.url} target="_blank" rel="noreferrer">
                            {result.title}
                          </a>
                        ) : (
                          <strong>{result.title}</strong>
                        )}
                        {result.excerpt && <p>{result.excerpt}</p>}
                        {result.updatedAt && (
                          <small>
                            {new Date(result.updatedAt).toLocaleString()}
                          </small>
                        )}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p>Loading integrations…</p>
              )
            ) : panel === "audit" ? (
              <ul className="audit-list">
                {(audit || []).map((event, index) => (
                  <li key={`${event.createdAt}-${index}`}>
                    <strong>{event.action}</strong>
                    <span>{new Date(event.createdAt).toLocaleString()}</span>
                    <small>{event.userId}</small>
                  </li>
                ))}
                {!audit?.length && <li>No recent activity.</li>}
              </ul>
            ) : panel === "analytics" ? (
              analytics ? (
                <div className="analytics-panel">
                  <div className="analytics-stats">
                    <div>
                      <strong>{analytics.conversationsLastWeek}</strong>
                      <span>Chats this week</span>
                    </div>
                    <div>
                      <strong>{analytics.feedback.helpful || 0}</strong>
                      <span>Helpful ratings</span>
                    </div>
                    <div>
                      <strong>{analytics.feedback.not_helpful || 0}</strong>
                      <span>Needs improvement</span>
                    </div>
                    <div>
                      <strong>{analytics.failuresLastWeek}</strong>
                      <span>Failures this week</span>
                    </div>
                    <div>
                      <strong>
                        {analytics.performance.averageMs ?? "—"} ms
                      </strong>
                      <span>
                        Average AI response · {analytics.performance.samples}{" "}
                        samples
                      </span>
                    </div>
                  </div>
                  <h3>Chat activity · 7 days</h3>
                  <div
                    className="analytics-chart"
                    role="img"
                    aria-label="Daily chat volume for the past seven days"
                  >
                    {analytics.usageByDay.map((day) => {
                      const peak = Math.max(
                        1,
                        ...analytics.usageByDay.map((item) => item.count),
                      );
                      return (
                        <div className="analytics-day" key={day.day}>
                          <span>{day.count}</span>
                          <div>
                            <i
                              style={{
                                height: `${Math.max(4, (day.count / peak) * 100)}%`,
                              }}
                            />
                          </div>
                          <small>
                            {new Date(
                              `${day.day}T12:00:00Z`,
                            ).toLocaleDateString(undefined, {
                              weekday: "short",
                              timeZone: "UTC",
                            })}
                          </small>
                        </div>
                      );
                    })}
                  </div>
                  <p className="analytics-note">
                    {analytics.conversations} total chats · {analytics.failures}{" "}
                    recorded failures. Latency is process-local and resets when
                    the server restarts. Mean{" "}
                    {analytics.performance.averageMs ?? "—"} ms · p95{" "}
                    {analytics.performance.p95Ms ?? "—"} ms. Counts exclude
                    message content and identifiers.
                  </p>
                </div>
              ) : (
                <p>Loading analytics…</p>
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
