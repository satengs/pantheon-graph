import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const confirmDemoLogin = createServerFn({ method: "POST" })
  .validator(z.object({ user: z.string(), password: z.string() }))
  .handler(async ({ data }) => {
    const { issueDemoCookie } = await import("./demo-session.server");
    const user = data.user.trim();
    const pass = data.password;
    if (user !== "admin" || pass !== "123") {
      throw new Error("Wrong admin or password");
    }
    await issueDemoCookie();
    return { ok: true as const };
  });
