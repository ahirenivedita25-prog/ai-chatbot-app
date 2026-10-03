import { useCallback, useEffect, useRef, useState } from "react";
import AuthView from "./components/AuthView.jsx";
import Composer from "./components/Composer.jsx";
import MessageList from "./components/MessageList.jsx";
import Sidebar from "./components/Sidebar.jsx";

async function parseResponse(response) {
  const result = response.status === 204 ? {} : await response.json();
  if (!response.ok) throw new Error(result.error || "Request failed");
  return result;
}

export default function App() {
  const [token, setToken] = useState("");
  const [user, setUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [threads, setThreads] = useState([]);
  const [activeId, setActiveId] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem("moonlit-sidebar-collapsed") === "true",
  );
  const [theme, setTheme] = useState(
    () => localStorage.getItem("moonlit-theme") || "light",
  );
  const refreshInFlight = useRef(null);

  const acceptSession = useCallback((session) => {
    setToken(session.token);
    setUser(session.user);
  }, []);

  const refreshSession = useCallback(async () => {
    if (refreshInFlight.current) return refreshInFlight.current;
    refreshInFlight.current = (async () => {
      try {
        const response = await fetch("/api/auth/refresh", {
          method: "POST",
          credentials: "same-origin",
        });
        if (!response.ok) return null;
        const session = await response.json();
        acceptSession(session);
        return session;
      } catch {
        return null;
      } finally {
        refreshInFlight.current = null;
      }
    })();
    return refreshInFlight.current;
  }, [acceptSession]);

  const apiRequest = useCallback(
    async (url, options = {}) => {
      const send = (accessToken) => {
        const headers = new Headers(options.headers || {});
        if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
        return fetch(url, {
          ...options,
          headers,
          credentials: "same-origin",
        });
      };

      let response = await send(token);
      if (response.status === 401) {
        const session = await refreshSession();
        if (session) response = await send(session.token);
      }
      return response;
    },
    [refreshSession, token],
  );

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  useEffect(() => {
    if (!user) return undefined;
    let active = true;
    apiRequest("/api/conversations/threads")
      .then(parseResponse)
      .then(({ threads: savedThreads }) => {
        if (!active) return;
        setThreads(savedThreads);
        if (savedThreads.length) {
          setActiveId(savedThreads[0].id);
          setMessages(savedThreads[0].messages);
        }
      })
      .catch((error) => setStatus(error.message));
    return () => {
      active = false;
    };
  }, [apiRequest, user]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("moonlit-theme", theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("moonlit-sidebar-collapsed", String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  useEffect(() => {
    function onShortcut(event) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        newChat();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "b") {
        event.preventDefault();
        setSidebarCollapsed((value) => !value);
      }
    }
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  });

  async function logout() {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "same-origin",
    });
    setToken("");
    setUser(null);
    setMessages([]);
    setThreads([]);
    setStatus("Signed out.");
  }

  async function sendMessage(message, attachments, action = "") {
    setBusy(true);
    setStatus("");
    const activeThreadId = activeId;
    const existingThread = threads.find(
      (thread) => thread.id === activeThreadId,
    );
    const userText =
      message || `Review ${attachments.map((file) => file.name).join(", ")}.`;
    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "user", text: userText },
    ]);
    try {
      const response = await apiRequest("/api/school/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          attachments,
          threadId: activeThreadId,
          action,
        }),
      });
      const result = await parseResponse(response);
      const savedThread = {
        id: String(result.threadId || activeThreadId),
        title:
          existingThread?.label ||
          (existingThread?.messages?.length ? existingThread.title : userText),
        label: existingThread?.label || "",
        industry: result.industry,
        messages: [
          ...(existingThread?.messages || []),
          {
            id: `${result.conversationId}-question`,
            role: "user",
            text: userText,
          },
          {
            id: `${result.conversationId}-answer`,
            role: "assistant",
            text: result.reply,
            conversationId: String(result.conversationId),
          },
        ],
      };
      setThreads((current) => [
        savedThread,
        ...current.filter((thread) => thread.id !== activeThreadId),
      ]);
      setActiveId(savedThread.id);
      setMessages(savedThread.messages);
      setStatus(`Answered with ${result.modelVersion}.`);
    } catch (error) {
      setStatus(error.message);
    } finally {
      setBusy(false);
    }
  }

  function newChat() {
    const id = crypto.randomUUID();
    const thread = { id, title: "New conversation", messages: [] };
    setThreads((current) => [thread, ...current]);
    setActiveId(id);
    setMessages([]);
    setSidebarOpen(false);
  }

  async function rateMessage(message, rating) {
    try {
      await parseResponse(
        await apiRequest(
          `/api/conversations/${message.conversationId}/feedback`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ rating }),
          },
        ),
      );
      const updateFeedback = (items) =>
        items.map((item) =>
          item.id === message.id ? { ...item, feedback: rating } : item,
        );
      setMessages(updateFeedback);
      setThreads((current) =>
        current.map((thread) => ({
          ...thread,
          messages: updateFeedback(thread.messages),
        })),
      );
      setStatus("Feedback saved.");
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function renameThread(thread) {
    const label = window.prompt("Name this chat", thread.label || thread.title);
    if (label === null) return;
    try {
      await parseResponse(
        await apiRequest(
          `/api/conversations/threads/${encodeURIComponent(thread.id)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ label }),
          },
        ),
      );
      setThreads((current) =>
        current.map((item) =>
          item.id === thread.id
            ? {
                ...item,
                label: label.trim(),
                title:
                  label.trim() || item.messages[0]?.text || "New conversation",
              }
            : item,
        ),
      );
    } catch (error) {
      setStatus(error.message);
    }
  }

  if (!user) return <AuthView onAuthenticated={acceptSession} />;

  return (
    <main
      className={`app-shell min-h-dvh bg-moon-paper text-moon-ink ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}
    >
      <Sidebar
        user={user}
        threads={threads}
        activeId={activeId}
        onNewChat={newChat}
        onOpen={(id) => {
          setActiveId(id);
          setMessages(
            threads.find((thread) => thread.id === id)?.messages || [],
          );
          setSidebarOpen(false);
        }}
        onLogout={logout}
        apiRequest={apiRequest}
        onRename={renameThread}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={() => setSidebarCollapsed((value) => !value)}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <section
        className="workspace flex min-w-0 flex-col"
        aria-label="Moonlit chat workspace"
      >
        <header className="topbar">
          <button
            className="mobile-toggle"
            aria-label="Open navigation"
            onClick={() => setSidebarOpen(true)}
          >
            ☰
          </button>
          <div>
            <h2>
              {threads.find((thread) => thread.id === activeId)?.title ||
                "New conversation"}
            </h2>
            <p>
              <span className="online-dot" />
              Moonlit · One shared assistant
            </p>
          </div>
          {user.role !== "admin" && (
            <button className="link-button" onClick={logout}>
              Logout
            </button>
          )}
          <button
            className="icon-control theme-toggle"
            type="button"
            aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
            title="Toggle theme"
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
          >
            {theme === "light" ? "◐" : "☼"}
          </button>
        </header>
        <MessageList messages={messages} busy={busy} onFeedback={rateMessage} />
        {user.role === "viewer" ? (
          <p className="viewer-notice" role="status">
            Viewer access · you can read and rate responses, but cannot send
            messages.
          </p>
        ) : (
          <Composer onSend={sendMessage} busy={busy} apiRequest={apiRequest} />
        )}
        <div role="status" className="composer-caption">
          {status}
        </div>
      </section>
    </main>
  );
}
