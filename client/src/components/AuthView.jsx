import { useEffect, useState } from "react";

export default function AuthView({ onAuthenticated }) {
  const inviteToken =
    new URLSearchParams(location.hash.slice(1)).get("invite") ||
    new URLSearchParams(location.search).get("invite") ||
    "";
  const [registering, setRegistering] = useState(Boolean(inviteToken));
  const [invitation, setInvitation] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!inviteToken) return;
    fetch(`/api/auth/invitations/${encodeURIComponent(inviteToken)}`)
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.error || "Invitation is invalid");
        setInvitation(result.invitation);
      })
      .catch((requestError) => setError(requestError.message));
  }, [inviteToken]);

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
            ...(registering && inviteToken ? { inviteToken } : {}),
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
        <h1>
          {registering
            ? inviteToken
              ? "Accept your invitation"
              : "Create your account"
            : "Sign in to Moonlit"}
        </h1>
        {invitation && (
          <p className="muted">
            Invited as {invitation.role}: {invitation.email}
          </p>
        )}
        <p className="muted">Your conversations are private to your account.</p>
        <form onSubmit={submit} className="auth-form">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            defaultValue={invitation?.email || ""}
            readOnly={Boolean(invitation)}
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
