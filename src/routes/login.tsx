import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { GROK_PROVIDERS, authEnabled, signIn } from "@/lib/auth/client";
import { confirmDemoLogin } from "@/lib/server/demo-session";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const navigate = useNavigate();
  const [user, setUser] = useState("admin");
  const [password, setPassword] = useState("123");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await confirmDemoLogin({ data: { user: user.trim(), password } });
      try {
        sessionStorage.setItem("origin.demo", "1");
      } catch {
        /* ignore */
      }
      await navigate({ to: "/" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-4 text-fg">
      <div className="w-full max-w-sm rounded-2xl bg-surface p-6 shadow-[var(--shadow-border)]">
        <p className="font-display text-3xl tracking-tight">Origin</p>
        <p className="mt-1 text-sm text-muted">Content graph studio</p>
        {authEnabled ? (
          <form
            className="mt-6 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void confirm();
            }}
          >
            <label className="block text-xs text-muted">
              Username
              <input
                value={user}
                onChange={(e) => setUser(e.target.value)}
                autoComplete="username"
                name="username"
                className="mt-1 h-10 w-full rounded-md bg-bg px-3 text-sm text-fg shadow-[var(--shadow-border)]"
              />
            </label>
            <label className="block text-xs text-muted">
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="mt-1 h-10 w-full rounded-md bg-bg px-3 text-sm text-fg shadow-[var(--shadow-border)]"
              />
            </label>
            {error ? <p className="text-sm text-danger">{error}</p> : null}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Signing in…" : "Confirm"}
            </Button>
            <div className="pt-2 space-y-2">
              {GROK_PROVIDERS.map((p) => (
                <button
                  key={p.providerId}
                  type="button"
                  onClick={() => void signIn(p.providerId, { callbackURL: "/" })}
                  className="w-full rounded-md bg-raised px-4 py-2 text-sm text-muted hover:text-fg"
                >
                  Continue with {p.label}
                </button>
              ))}
            </div>
          </form>
        ) : (
          <p className="mt-4 text-sm text-muted">Sign-in is disabled.</p>
        )}
      </div>
    </main>
  );
}
