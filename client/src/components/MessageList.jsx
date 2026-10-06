import { useEffect, useRef } from "react";

export default function MessageList({
  messages,
  busy,
  onFeedback,
  pinnedIds = [],
  onTogglePin,
  onReply,
}) {
  const listRef = useRef(null);
  const nearBottom = useRef(true);

  useEffect(() => {
    if (nearBottom.current)
      listRef.current?.scrollTo({
        top: listRef.current.scrollHeight,
        behavior: "smooth",
      });
  }, [messages, busy]);

  return (
    <div
      className="messages"
      aria-live="polite"
      ref={listRef}
      onScroll={(event) => {
        const element = event.currentTarget;
        nearBottom.current =
          element.scrollHeight - element.scrollTop - element.clientHeight < 80;
      }}
    >
      {messages.some((message) => pinnedIds.includes(message.id)) && (
        <nav className="pinned-messages" aria-label="Pinned messages">
          <span>Pinned</span>
          {messages
            .filter((message) => pinnedIds.includes(message.id))
            .map((message) => (
              <button
                type="button"
                key={message.id}
                onClick={() =>
                  document
                    .getElementById(`message-${message.id}`)
                    ?.scrollIntoView({ behavior: "smooth", block: "center" })
                }
              >
                {message.text.slice(0, 48) || "Image attachment"}
              </button>
            ))}
        </nav>
      )}
      {!messages.length && (
        <div className="welcome">
          <img src="/chatbot-mark.svg" alt="" />
          <p className="eyebrow">Moonlit assistant</p>
          <h1>What are we working on?</h1>
          <p>Ask a question or attach a file.</p>
        </div>
      )}
      {messages.map((message) => (
        <article
          className={`message ${message.role}`}
          id={`message-${message.id}`}
          key={message.id}
        >
          <img
            className="message-avatar"
            src={
              message.role === "user"
                ? "/chatbot-mark.svg"
                : "/chatbot-mark.svg"
            }
            alt=""
          />
          <div className="message-content">
            {message.replyTo && (
              <blockquote className="reply-reference">
                {message.replyTo.text}
              </blockquote>
            )}
            <div className="bubble">{message.text}</div>
            {message.attachments?.map((attachment) => (
              <div className="message-attachment" key={attachment.name}>
                <img
                  src={attachment.data}
                  alt={attachment.name}
                  loading="lazy"
                />
                <span>{attachment.name}</span>
              </div>
            ))}
            <div className="message-tools">
              {onReply && (
                <button
                  type="button"
                  aria-label={`Reply to message: ${message.text.slice(0, 60)}`}
                  onClick={() => onReply(message)}
                >
                  Reply
                </button>
              )}
              {onTogglePin && (
                <button
                  type="button"
                  aria-pressed={pinnedIds.includes(message.id)}
                  onClick={() => onTogglePin(message)}
                >
                  {pinnedIds.includes(message.id) ? "Unpin" : "Pin"}
                </button>
              )}
            </div>
          </div>
          {message.role === "assistant" &&
            message.conversationId &&
            onFeedback && (
              <div className="message-feedback" aria-label="Rate this response">
                <button
                  type="button"
                  aria-label="Helpful response"
                  aria-pressed={message.feedback === "helpful"}
                  title="Helpful"
                  onClick={() => onFeedback(message, "helpful")}
                >
                  👍
                </button>
                <button
                  type="button"
                  aria-label="Not helpful response"
                  aria-pressed={message.feedback === "not_helpful"}
                  title="Not helpful"
                  onClick={() => onFeedback(message, "not_helpful")}
                >
                  👎
                </button>
              </div>
            )}
        </article>
      ))}
      {busy && (
        <p className="muted" role="status">
          Moonlit is thinking…
        </p>
      )}
    </div>
  );
}
