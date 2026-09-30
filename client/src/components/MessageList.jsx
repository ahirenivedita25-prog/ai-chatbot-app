export default function MessageList({ messages, busy }) {
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
