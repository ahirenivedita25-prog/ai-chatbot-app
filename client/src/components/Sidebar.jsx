import AdminMenu from "./AdminMenu.jsx";
import { useEffect, useMemo, useState } from "react";

export default function Sidebar({
  user,
  threads,
  activeId,
  onNewChat,
  onOpen,
  onLogout,
  apiRequest,
  onRename,
  collapsed,
  section,
  onSectionChange,
  generatedImages,
  onImageClick,
  onToggleCollapsed,
  open,
  onClose,
}) {
  const [search, setSearch] = useState("");
  const [industry, setIndustry] = useState("all");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteResult, setInviteResult] = useState(null);
  const [inviteError, setInviteError] = useState("");
  const [invitations, setInvitations] = useState([]);

  useEffect(() => {
    if (!inviteOpen || user.role !== "admin") return;
    apiRequest("/api/admin/invites")
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.error || "Could not load invitations");
        setInvitations(result.invitations);
      })
      .catch((error) => setInviteError(error.message));
  }, [apiRequest, inviteOpen, user.role]);
  const filteredThreads = useMemo(
    () =>
      threads.filter((thread) => {
        const matchesSearch =
          `${thread.title} ${thread.messages?.map((message) => message.text).join(" ") || ""}`
            .toLowerCase()
            .includes(search.toLowerCase());
        return (
          matchesSearch && (industry === "all" || thread.industry === industry)
        );
      }),
    [threads, search, industry],
  );

  async function createInvite(event) {
    event.preventDefault();
    setInviteBusy(true);
    setInviteError("");
    setInviteResult(null);
    const form = new FormData(event.currentTarget);
    try {
      const response = await apiRequest("/api/admin/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.get("email"),
          role: form.get("role"),
          expiresHours: Number(form.get("expiresHours")),
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Could not create invitation");
      setInviteResult(result);
      setInvitations((current) => [result.invitation, ...current]);
    } catch (error) {
      setInviteError(error.message);
    } finally {
      setInviteBusy(false);
    }
  }

  async function revokeInvite(id) {
    try {
      const response = await apiRequest(
        `/api/admin/invites/${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || "Could not revoke invitation");
      }
      setInvitations((current) =>
        current.filter((invitation) => invitation.id !== id),
      );
    } catch (error) {
      setInviteError(error.message);
    }
  }

  return (
    <>
      <aside
        className={`sidebar ${open ? "open" : ""} ${collapsed ? "sidebar-mini" : ""}`}
      >
        <a className="brand" href="/" aria-label="Moonlit home">
          <img src="/chatbot-mark.svg" alt="" />
          <span>Moonlit</span>
        </a>
        <button
          className="collapse-control"
          type="button"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          onClick={onToggleCollapsed}
        >
          {collapsed ? "›" : "‹"}
        </button>
        <div className="sidebar-tools">
          <button
            className="nav-button active"
            onClick={onNewChat}
            title="New chat (Ctrl+K)"
          >
            <span aria-hidden="true">＋</span>
            <span className="nav-label">New chat</span>
          </button>
          {user.role === "admin" && (
            <button
              className="nav-button"
              onClick={() => {
                setInviteOpen(true);
                setInviteResult(null);
              }}
              title="Invite a workspace member"
            >
              <span aria-hidden="true">↗</span>
              <span className="nav-label">Invite</span>
            </button>
          )}
        </div>
        <nav className="sidebar-sections" aria-label="Sidebar sections">
          <button
            type="button"
            aria-pressed={section === "chats"}
            className={section === "chats" ? "selected" : ""}
            onClick={() => onSectionChange("chats")}
            title="Recent chats"
          >
            <span aria-hidden="true">◷</span>
            <span className="sidebar-section-label">Recent Chats</span>
          </button>
          <button
            type="button"
            aria-pressed={section === "gallery"}
            className={section === "gallery" ? "selected" : ""}
            onClick={() => onSectionChange("gallery")}
            title="Generated image gallery"
          >
            <span aria-hidden="true">▦</span>
            <span className="sidebar-section-label">Gallery</span>
            <span className="sidebar-section-count">
              {generatedImages.length}
            </span>
          </button>
        </nav>
        {section === "chats" ? (
          <>
            <div className="history-heading">
              <p className="history-title">Recent Chats</p>
              <span>{filteredThreads.length}</span>
            </div>
            {!collapsed && (
              <div className="thread-filters">
                <input
                  aria-label="Search chats"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search chats"
                />
                <select
                  aria-label="Filter chats by workspace"
                  value={industry}
                  onChange={(event) => setIndustry(event.target.value)}
                >
                  <option value="all">All workspaces</option>
                  {[
                    ...new Set(
                      threads.map((thread) => thread.industry).filter(Boolean),
                    ),
                  ].map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <nav className="history-list" aria-label="Recent chats">
              {filteredThreads.map((thread) => (
                <div
                  className={`history-row ${thread.id === activeId ? "active" : ""}`}
                  key={thread.id}
                >
                  <button
                    className="history-item"
                    onClick={() => onOpen(thread.id)}
                    title={thread.title}
                  >
                    <span aria-hidden="true">◦</span>
                    <span className="history-label">{thread.title}</span>
                  </button>
                  {!collapsed && (
                    <button
                      className="rename-thread"
                      type="button"
                      aria-label={`Rename ${thread.title}`}
                      title="Rename chat"
                      onClick={() => onRename(thread)}
                    >
                      ···
                    </button>
                  )}
                </div>
              ))}
              {!filteredThreads.length && (
                <p className="history-empty">No matching chats</p>
              )}
            </nav>
          </>
        ) : (
          <section
            className="sidebar-gallery"
            aria-label="Generated image gallery"
          >
            <div className="history-heading">
              <p className="history-title">Generated Images</p>
              <span>{generatedImages.length}</span>
            </div>
            {generatedImages.length ? (
              <div className="sidebar-gallery-grid">
                {generatedImages.map((image) => (
                  <button
                    type="button"
                    key={image.id}
                    aria-label={`View ${image.name}`}
                    title={image.name}
                    onClick={onImageClick}
                  >
                    <img src={image.data} alt="" loading="lazy" />
                  </button>
                ))}
              </div>
            ) : (
              <p className="history-empty">Enhanced images appear here.</p>
            )}
          </section>
        )}
        <div className="sidebar-spacer" />
        <div className="profile">
          <span className="profile-avatar" aria-hidden="true">
            {user.email.slice(0, 1).toUpperCase()}
          </span>
          <span className="profile-copy">
            {user.email}
            <small>
              {user.role === "admin" ? "Admin workspace" : "Member workspace"}
            </small>
          </span>
          {user.role === "admin" && (
            <AdminMenu onLogout={onLogout} apiRequest={apiRequest} />
          )}
          {user.role !== "admin" && (
            <button
              className="menu-trigger"
              onClick={onLogout}
              aria-label="Log out"
            >
              ↗
            </button>
          )}
        </div>
      </aside>
      {open && (
        <button
          className="mobile-scrim"
          aria-label="Close navigation"
          onClick={onClose}
        />
      )}
      {inviteOpen && (
        <div
          className="dialog-backdrop"
          role="presentation"
          onClick={() => setInviteOpen(false)}
        >
          <section
            className="dialog invite-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="invite-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="dialog-header">
              <h2 id="invite-title">Invite to Moonlit</h2>
              <button
                className="icon-control"
                type="button"
                aria-label="Close invite dialog"
                onClick={() => setInviteOpen(false)}
              >
                ×
              </button>
            </div>
            {inviteResult ? (
              <div className="invite-result" role="status">
                <p>
                  {inviteResult.emailSent
                    ? "Invitation email sent."
                    : "Invite link created. Copy and send it to the invitee."}
                </p>
                <label htmlFor="invite-link">
                  Single-use link · expires{" "}
                  {new Date(inviteResult.invitation.expiresAt).toLocaleString()}
                </label>
                <input
                  id="invite-link"
                  readOnly
                  value={inviteResult.inviteUrl}
                  onFocus={(event) => event.target.select()}
                />
                <button
                  className="button-primary"
                  type="button"
                  onClick={() =>
                    navigator.clipboard.writeText(inviteResult.inviteUrl)
                  }
                >
                  Copy invite link
                </button>
              </div>
            ) : (
              <form className="auth-form" onSubmit={createInvite}>
                <label htmlFor="invite-email">Email address</label>
                <input
                  id="invite-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={254}
                />
                <label htmlFor="invite-role">Workspace role</label>
                <select id="invite-role" name="role" defaultValue="editor">
                  <option value="admin">Admin</option>
                  <option value="editor">Editor</option>
                  <option value="viewer">Viewer</option>
                </select>
                <label htmlFor="invite-expiry">Link expiry</label>
                <select
                  id="invite-expiry"
                  name="expiresHours"
                  defaultValue="72"
                >
                  <option value="24">24 hours</option>
                  <option value="72">3 days</option>
                  <option value="168">7 days</option>
                  <option value="720">30 days</option>
                </select>
                {inviteError && (
                  <p className="error-text" role="alert">
                    {inviteError}
                  </p>
                )}
                <button className="button-primary" disabled={inviteBusy}>
                  {inviteBusy ? "Creating invite…" : "Create invitation"}
                </button>
              </form>
            )}
            <section className="invite-list" aria-label="Pending invitations">
              <h3>Invitations</h3>
              {invitations
                .filter(
                  (item) =>
                    !item.acceptedAt && new Date(item.expiresAt) > new Date(),
                )
                .map((item) => (
                  <div className="invite-row" key={item.id}>
                    <span>
                      <strong>{item.email}</strong>
                      <small>
                        {item.role} · expires{" "}
                        {new Date(item.expiresAt).toLocaleDateString()}
                      </small>
                    </span>
                    <button
                      type="button"
                      aria-label={`Revoke invite for ${item.email}`}
                      onClick={() => void revokeInvite(item.id)}
                    >
                      Revoke
                    </button>
                  </div>
                ))}
              {!invitations.some(
                (item) =>
                  !item.acceptedAt && new Date(item.expiresAt) > new Date(),
              ) && <p className="muted">No pending invitations.</p>}
            </section>
          </section>
        </div>
      )}
    </>
  );
}
