import { createServerFn } from "@tanstack/react-start";
import { getCookie, setCookie } from "@tanstack/react-start/server";
import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";

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

export const confirmDemoLogin = createServerFn({ method: "POST" })
  .validator(z.object({ user: z.string(), password: z.string() }))
  .handler(async ({ data }) => {
    const user = data.user.trim();
    const pass = data.password;
    if (user !== "admin" || pass !== "123") {
      throw new Error("Wrong admin or password");
    }
    const token = await new SignJWT({ name: "admin" })
      .setSubject("admin")
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("7d")
      .sign(secret());
    setCookie(COOKIE, token, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
    return { ok: true as const };
  });
