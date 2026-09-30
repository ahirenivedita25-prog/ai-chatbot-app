import { useState } from "react";

export default function AuthView({ onAuthenticated }) {
  const [registering, setRegistering] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(
        `/api/auth/${registering ? "register" : "login"}`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: form.get("email"),
            password: form.get("password"),
          }),
        },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Authentication failed");
      onAuthenticated(result);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-screen">
      <section className="auth-panel min-w-0 bg-white">
        <img src="/chatbot-mark.svg" className="brand-mark" alt="" />
        <p className="eyebrow">Private assistant workspace</p>
        <h1>{registering ? "Create your account" : "Sign in to Moonlit"}</h1>
        <p className="muted">Your conversations are private to your account.</p>
        <form onSubmit={submit} className="auth-form">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
          />
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete={registering ? "new-password" : "current-password"}
            minLength={8}
            maxLength={128}
            required
          />
          {error && (
            <p className="error-text" role="alert">
              {error}
            </p>
          )}
          <button className="button-primary" disabled={busy}>
            {busy ? "Please wait…" : registering ? "Create account" : "Sign in"}
          </button>
        </form>
        <button
          className="link-button"
          onClick={() => setRegistering(!registering)}
          type="button"
        >
          {registering ? "Already registered? Sign in" : "Create a new account"}
        </button>
      </section>
    </main>
  );
}
