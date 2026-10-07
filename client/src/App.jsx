import { useCallback, useEffect, useRef, useState } from "react";
import AuthView from "./components/AuthView.jsx";
import Composer from "./components/Composer.jsx";
import MessageList from "./components/MessageList.jsx";
import Sidebar from "./components/Sidebar.jsx";
import {
  listGeneratedImages,
  saveGeneratedImage,
} from "./imageGalleryStore.js";

async function parseResponse(response) {
  const result = response.status === 204 ? {} : await response.json();
  if (!response.ok) {
    const error = new Error(result.error || "Request failed");
    Object.assign(error, result);
    throw error;
  }
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
  const [pinnedIds, setPinnedIds] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("moonlit-pins") || "[]");
    } catch {
      return [];
    }
  });
  const [replyTo, setReplyTo] = useState(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [generatedImages, setGeneratedImages] = useState([]);
  const [serviceRequests, setServiceRequests] = useState([]);
  const [sidebarSection, setSidebarSection] = useState("chats");
  const [notifications, setNotifications] = useState([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [largeText, setLargeText] = useState(
    () => localStorage.getItem("moonlit-large-text") === "true",
  );
  const refreshInFlight = useRef(null);

  const acceptSession = useCallback((session) => {
    setToken(session.token);
    setUser(session.user);
    try {
      setNotifications(
        JSON.parse(
          localStorage.getItem(`moonlit-notifications-${session.user.id}`) ||
            "[]",
        ),
      );
    } catch {
      setNotifications([]);
    }
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
    if (!user) return undefined;
    let active = true;
    listGeneratedImages(user.id)
      .then((images) => {
        if (active) setGeneratedImages(images);
      })
      .catch((error) => setStatus(error.message));
    return () => {
      active = false;
    };
  }, [user]);

  useEffect(() => {
    if (!user) return undefined;
    let active = true;
    apiRequest("/api/service-requests")
      .then(parseResponse)
      .then(({ requests }) => {
        if (active) setServiceRequests(requests);
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
    localStorage.setItem("moonlit-pins", JSON.stringify(pinnedIds));
  }, [pinnedIds]);

  useEffect(() => {
    localStorage.setItem("moonlit-large-text", String(largeText));
  }, [largeText]);

  useEffect(() => {
    if (!user) return;
    localStorage.setItem(
      `moonlit-notifications-${user.id}`,
      JSON.stringify(notifications),
    );
  }, [notifications, user]);

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
    setGeneratedImages([]);
    setServiceRequests([]);
    setPinnedIds([]);
    setNotifications([]);
    setStatus("Signed out.");
  }

  function addNotification(title, detail) {
    setNotifications((current) =>
      [
        {
          id: crypto.randomUUID(),
          title,
          detail,
          createdAt: new Date().toISOString(),
          read: false,
        },
        ...current,
      ].slice(0, 20),
    );
  }

  async function createServiceRequest(category, details) {
    const result = await parseResponse(
      await apiRequest("/api/service-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, details }),
      }),
    );
    setServiceRequests((current) => [result.request, ...current]);
    setSidebarSection("requests");
    setStatus("Request received for staff follow-up. No transaction was made.");
  }

  async function updateServiceRequestStatus(requestId, nextStatus) {
    const result = await parseResponse(
      await apiRequest(
        `/api/service-requests/${encodeURIComponent(requestId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: nextStatus }),
        },
      ),
    );
    setServiceRequests((current) =>
      current.map((item) => (item.id === requestId ? result.request : item)),
    );
  }

  async function sendMessage(message, attachments, action = "", reply = null) {
    setBusy(true);
    setStatus("");
    const activeThreadId = activeId;
    const existingThread = threads.find(
      (thread) => thread.id === activeThreadId,
    );
    const localImageMessages = messages.filter(
      (item) =>
        item.role === "assistant" &&
        item.attachments?.length &&
        !(existingThread?.messages || []).some((saved) => saved.id === item.id),
    );
    const userText =
      message || `Review ${attachments.map((file) => file.name).join(", ")}.`;
    const requestText = reply
      ? `Replying to: ${reply.text}\n\n${userText}`
      : userText;
    setMessages((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        role: "user",
        text: userText,
        replyTo: reply,
        attachments: attachments.filter(
          (file) => file.type?.startsWith("image/") && file.data,
        ),
      },
    ]);
    setReplyTo(null);
    try {
      const response = await apiRequest("/api/school/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: requestText,
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
          ...localImageMessages,
          {
            id: `${result.conversationId}-question`,
            role: "user",
            text: userText,
            replyTo: reply,
            attachments: attachments.filter(
              (file) => file.type?.startsWith("image/") && file.data,
            ),
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
      addNotification("Assistant reply ready", userText.slice(0, 120));
    } catch (error) {
      if (error.id && error.threadId) {
        const savedThread = {
          id: String(error.threadId),
          title:
            existingThread?.label ||
            (existingThread?.messages?.length
              ? existingThread.title
              : userText),
          label: existingThread?.label || "",
          industry: existingThread?.industry || "school",
          messages: [
            ...(existingThread?.messages || []),
            ...localImageMessages,
            {
              id: `${error.id}-question`,
              role: "user",
              text: userText,
              replyTo: reply,
              attachments: attachments.filter(
                (file) => file.type?.startsWith("image/") && file.data,
              ),
            },
            {
              id: `${error.id}-answer`,
              role: "assistant",
              text: "Moonlit could not complete this reply. Please try again.",
              conversationId: String(error.id),
            },
          ],
        };
        setThreads((current) => [
          savedThread,
          ...current.filter((thread) => thread.id !== activeThreadId),
        ]);
        setActiveId(savedThread.id);
        setMessages(savedThread.messages);
      }
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

  function togglePin(message) {
    setPinnedIds((current) =>
      current.includes(message.id)
        ? current.filter((id) => id !== message.id)
        : [...current, message.id],
    );
    setStatus(
      pinnedIds.includes(message.id) ? "Message unpinned." : "Message pinned.",
    );
  }

  const galleryImages = generatedImages;

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
      className={`app-shell min-h-dvh bg-moon-paper text-moon-ink ${sidebarCollapsed ? "sidebar-collapsed" : ""} ${largeText ? "large-text" : ""}`}
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
        section={sidebarSection}
        onSectionChange={setSidebarSection}
        generatedImages={generatedImages}
        serviceRequests={serviceRequests}
        onRequestStatusChange={updateServiceRequestStatus}
        onImageClick={() => setGalleryOpen(true)}
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
          <button
            className="icon-control text-size-toggle"
            type="button"
            aria-label={
              largeText ? "Use standard text size" : "Use larger text"
            }
            aria-pressed={largeText}
            title="Toggle larger text"
            onClick={() => setLargeText((value) => !value)}
          >
            Aa
          </button>
          <div className="notification-root">
            <button
              className="icon-control notification-toggle"
              type="button"
              aria-label={`Notifications, ${notifications.filter((item) => !item.read).length} unread`}
              aria-expanded={notificationsOpen}
              aria-controls="notification-panel"
              onClick={() => setNotificationsOpen((value) => !value)}
            >
              !
              {notifications.some((item) => !item.read) && (
                <span className="notification-count">
                  {notifications.filter((item) => !item.read).length}
                </span>
              )}
            </button>
            {notificationsOpen && (
              <section
                className="notification-panel"
                id="notification-panel"
                aria-label="Notifications"
              >
                <div className="notification-heading">
                  <strong>Notifications</strong>
                  <button
                    type="button"
                    onClick={() =>
                      setNotifications((current) =>
                        current.map((item) => ({ ...item, read: true })),
                      )
                    }
                  >
                    Mark all read
                  </button>
                </div>
                {notifications.length ? (
                  <ul>
                    {notifications.map((item) => (
                      <li
                        className={item.read ? "read" : "unread"}
                        key={item.id}
                      >
                        <strong>{item.title}</strong>
                        <span>{item.detail}</span>
                        <time dateTime={item.createdAt}>
                          {new Date(item.createdAt).toLocaleString()}
                        </time>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted">You’re all caught up.</p>
                )}
              </section>
            )}
          </div>
          <button
            className="icon-control gallery-toggle"
            type="button"
            aria-label={`Open image gallery, ${galleryImages.length} images`}
            title="Image gallery"
            onClick={() => {
              setSidebarSection("gallery");
              setGalleryOpen(true);
            }}
          >
            ▦ <span>{galleryImages.length}</span>
          </button>
        </header>
        <MessageList
          messages={messages}
          busy={busy}
          onFeedback={rateMessage}
          pinnedIds={pinnedIds}
          onTogglePin={togglePin}
          onReply={(message) =>
            setReplyTo({ id: message.id, text: message.text })
          }
        />
        {user.role === "viewer" ? (
          <p className="viewer-notice" role="status">
            Viewer access · you can read and rate responses, but cannot send
            messages.
          </p>
        ) : (
          <Composer
            onSend={sendMessage}
            busy={busy}
            apiRequest={apiRequest}
            onCreateServiceRequest={createServiceRequest}
            replyTo={replyTo}
            onClearReply={() => setReplyTo(null)}
            onImageEnhanced={(image, style) => {
              const galleryImage = { ...image, id: crypto.randomUUID() };
              const enhancedMessage = {
                id: crypto.randomUUID(),
                role: "assistant",
                text: `Image enhancement complete · ${style.replaceAll("_", " ")}`,
                attachments: [galleryImage],
              };
              setGeneratedImages((current) => [...current, galleryImage]);
              void saveGeneratedImage(user.id, galleryImage).catch((error) =>
                setStatus(
                  `Image preview created, but could not save it locally: ${error.message}`,
                ),
              );
              addNotification("Image enhancement complete", galleryImage.name);
              setMessages((current) => [...current, enhancedMessage]);
              setThreads((current) =>
                current.map((thread) =>
                  thread.id === activeId
                    ? {
                        ...thread,
                        messages: [...thread.messages, enhancedMessage],
                      }
                    : thread,
                ),
              );
            }}
          />
        )}
        <div role="status" className="composer-caption">
          {status}
        </div>
      </section>
      {galleryOpen && (
        <div
          className="dialog-backdrop"
          role="presentation"
          onClick={() => setGalleryOpen(false)}
        >
          <section
            className="dialog image-gallery"
            role="dialog"
            aria-modal="true"
            aria-labelledby="gallery-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="dialog-header">
              <h2 id="gallery-title">Generated image gallery</h2>
              <button
                className="icon-control"
                type="button"
                aria-label="Close image gallery"
                onClick={() => setGalleryOpen(false)}
              >
                ×
              </button>
            </div>
            {galleryImages.length ? (
              <div className="gallery-grid">
                {galleryImages.map((image) => (
                  <figure key={image.id}>
                    <img src={image.data} alt={image.name} />
                    <figcaption>{image.name}</figcaption>
                  </figure>
                ))}
              </div>
            ) : (
              <p className="muted">No images in this conversation yet.</p>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
