import { createFileRoute } from "@tanstack/react-router";
import { BUILD_REF, BUILD_SHA, BUILD_TIME, shortSha } from "@/lib/build-info";

/** GET /version → which commit this deployment runs (public, no session needed). */
export const Route = createFileRoute("/version")({
  server: {
    handlers: {
      GET: () => {
        const sha = process.env.VERCEL_GIT_COMMIT_SHA?.trim() || BUILD_SHA;
        return new Response(
          `${JSON.stringify(
            {
              sha,
              short: shortSha(sha),
              ref: process.env.VERCEL_GIT_COMMIT_REF?.trim() || BUILD_REF || null,
              buildTime: BUILD_TIME || null,
              env: process.env.VERCEL_ENV ?? (process.env.NODE_ENV === "production" ? "production" : "development"),
            },
            null,
            2,
          )}\n`,
          { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } },
        );
      },
    },
  },
});
