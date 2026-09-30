import AdminMenu from "./AdminMenu.jsx";

export default function Sidebar({
  user,
  threads,
  activeId,
  onNewChat,
  onOpen,
  onLogout,
  apiRequest,
  open,
  onClose,
}) {
  return (
    <>
      <aside className={`sidebar ${open ? "open" : ""}`}>
        <a className="brand" href="/" aria-label="Moonlit home">
          <img src="/chatbot-mark.svg" alt="" />
          Moonlit
        </a>
        <div className="sidebar-tools">
          <button className="nav-button active" onClick={onNewChat}>
            <span>＋</span>New chat
          </button>
          <button
            className="nav-button"
            onClick={() => navigator.clipboard.writeText(location.href)}
          >
            <span>↗</span>Invite
          </button>
        </div>
        <p className="history-title">Chat history</p>
        <nav className="history-list" aria-label="Chat history">
          {threads.map((thread) => (
            <button
              key={thread.id}
              className={`history-item ${thread.id === activeId ? "active" : ""}`}
              onClick={() => onOpen(thread.id)}
              title={thread.title}
            >
              {thread.title}
            </button>
          ))}
        </nav>
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
    </>
  );
}
