import { createHmac, timingSafeEqual } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";
import { demoSessionSetCookieHeader } from "@/lib/server/demo-session.server";

/** Must match the audience seo-gui signs for this app. */
const AUDIENCE = "pantheon-graph-sso";
/** Longest a handoff token may live, whatever its own exp says. */
const MAX_TOKEN_TTL_SEC = 120;

/**
 * Verifies a `body.sig` handoff token from seo-gui's Connected Tools:
 * HMAC-SHA256 (base64url) of `body` with PANTHEON_GRAPH_SSO_SECRET, where
 * `body` is base64url JSON `{ aud, exp }`.
 */
function verifyHandoffToken(token: string, secret: string): boolean {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return false;
  const body = token.slice(0, dot);
  const sig = Buffer.from(token.slice(dot + 1), "base64url");
  const expected = createHmac("sha256", secret).update(body).digest();
  if (sig.length !== expected.length || !timingSafeEqual(sig, expected)) return false;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    const now = Math.floor(Date.now() / 1000);
    return (
      payload.aud === AUDIENCE &&
      typeof payload.exp === "number" &&
      payload.exp > now &&
      payload.exp <= now + MAX_TOKEN_TTL_SEC
    );
  } catch {
    return false;
  }
}

/**
 * Signs in from a seo-gui Connected Tools link: a valid handoff token gets the
 * same admin session as the login form; anything else lands on /login.
 */
export const Route = createFileRoute("/api/auth/sso")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const redirect = (path: string, headers: Record<string, string> = {}) =>
          new Response(null, {
            status: 302,
            headers: { Location: new URL(path, url).toString(), ...headers },
          });

        const secret = process.env.PANTHEON_GRAPH_SSO_SECRET?.trim();
        const token = url.searchParams.get("token");
        if (!secret || !token || !verifyHandoffToken(token, secret)) {
          return redirect("/login");
        }
        return redirect("/", { "Set-Cookie": await demoSessionSetCookieHeader() });
      },
    },
  },
});
