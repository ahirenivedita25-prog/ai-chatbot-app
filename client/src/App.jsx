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
    apiRequest("/api/conversations")
      .then(parseResponse)
      .then(({ conversations }) => {
        if (!active) return;
        const savedThreads = conversations.map((item) => ({
          id: String(item.id),
          title: item.message || "File attachment",
          industry: item.industry,
          messages: [
            {
              id: `${item.id}-question`,
              role: "user",
              text: item.message || "Review the attached file.",
            },
            { id: `${item.id}-answer`, role: "assistant", text: item.reply },
          ],
        }));
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

  async function sendMessage(message, attachments) {
    setBusy(true);
    setStatus("");
    const activeThreadId = activeId;
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
        body: JSON.stringify({ message, attachments }),
      });
      const result = await parseResponse(response);
      const savedThread = {
        id: String(result.conversationId),
        title: userText,
        industry: result.industry,
        messages: [
          {
            id: `${result.conversationId}-question`,
            role: "user",
            text: userText,
          },
          {
            id: `${result.conversationId}-answer`,
            role: "assistant",
            text: result.reply,
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

  if (!user) return <AuthView onAuthenticated={acceptSession} />;

  return (
    <main className="app-shell min-h-dvh bg-moon-paper text-moon-ink">
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
        </header>
        <MessageList messages={messages} busy={busy} />
        <Composer onSend={sendMessage} busy={busy} />
        <div role="status" className="composer-caption">
          {status}
        </div>
      </section>
    </main>
  );
}
