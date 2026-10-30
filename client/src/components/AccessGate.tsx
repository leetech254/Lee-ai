import { FormEvent, useState } from "react";
import { ArrowRight, LockKeyhole } from "lucide-react";

interface AccessGateProps {
  onAuthenticated: () => void;
}

export default function AccessGate({ onAuthenticated }: AccessGateProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/access/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!response.ok) throw new Error("Login failed");
      setPassword("");
      onAuthenticated();
    } catch {
      setPassword("");
      setError("We couldn’t sign you in. Check your password and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="access-screen">
      <section className="access-card" aria-labelledby="access-title">
        <div className="access-brand" aria-label="VMTech AI">
          <span className="brand-mark" aria-hidden="true">
            <span>V</span>
            <i />
          </span>
          <span className="brand-word">
            VMTECH<span className="brand-ai">AI</span>
          </span>
        </div>
        <div className="access-icon" aria-hidden="true">
          <LockKeyhole size={21} />
        </div>
        <p className="access-eyebrow">PRIVATE WORKSPACE</p>
        <h1 id="access-title">Welcome back.</h1>
        <p className="access-description">
          Enter your password to continue to your workspace.
        </p>
        <form className="access-form" onSubmit={submit}>
          <label htmlFor="access-password">Password</label>
          <input
            id="access-password"
            name="password"
            type="password"
            autoComplete="current-password"
            autoFocus
            required
            value={password}
            onChange={event => setPassword(event.target.value)}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "access-error" : undefined}
          />
          {error && (
            <p className="access-error" id="access-error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" disabled={busy || !password}>
            {busy ? "Signing in…" : "Continue"}
            {!busy && <ArrowRight size={16} aria-hidden="true" />}
          </button>
        </form>
        <p className="access-footnote">Your workspace is protected.</p>
      </section>
    </main>
  );
}
