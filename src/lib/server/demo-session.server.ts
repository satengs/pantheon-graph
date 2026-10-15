import { getCookie, setCookie } from "@tanstack/react-start/server";
import { SignJWT, jwtVerify } from "jose";

const COOKIE = "origin-demo";

function secret() {
  const raw = process.env.BETTER_AUTH_SECRET?.trim() || "origin-placeholder-login";
  return new TextEncoder().encode(raw);
}

export async function readDemoUser(): Promise<{ id: string; email: string | null } | null> {
  const token = getCookie(COOKIE);
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (!payload.sub) return null;
    return { id: String(payload.sub), email: null };
  } catch {
    return null;
  }
}

const MAX_AGE_SEC = 60 * 60 * 24 * 7;

/** The signed admin session JWT stored in the `origin-demo` cookie. */
async function createDemoToken(): Promise<string> {
  return new SignJWT({ name: "admin" })
    .setSubject("admin")
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .sign(secret());
}

export async function issueDemoCookie(): Promise<void> {
  setCookie(COOKIE, await createDemoToken(), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SEC,
  });
}

/**
 * The same session as `issueDemoCookie`, as a Set-Cookie header value — for
 * server routes that return their own Response (e.g. /api/auth/sso).
 */
export async function demoSessionSetCookieHeader(): Promise<string> {
  const token = await createDemoToken();
  return `${COOKIE}=${token}; Path=/; Max-Age=${MAX_AGE_SEC}; HttpOnly; Secure; SameSite=Lax`;
}
