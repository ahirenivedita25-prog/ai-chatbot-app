export default function MessageList({ messages, busy, onFeedback }) {
  return (
    <div className="messages" aria-live="polite">
      {!messages.length && (
        <div className="welcome">
          <img src="/chatbot-mark.svg" alt="" />
          <p className="eyebrow">Moonlit assistant</p>
          <h1>What are we working on?</h1>
          <p>Ask a question or attach a file.</p>
        </div>
      )}
      {messages.map((message) => (
        <article className={`message ${message.role}`} key={message.id}>
          <img
            className="message-avatar"
            src={
              message.role === "user"
                ? "/chatbot-mark.svg"
                : "/chatbot-mark.svg"
            }
            alt=""
          />
          <div className="bubble">{message.text}</div>
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
