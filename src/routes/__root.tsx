import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { BUILD_SHA, BUILD_TIME, shortSha } from "@/lib/build-info";
import appCss from "../styles.css?url";

const APP_NAME = "Origin";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: APP_NAME },
      {
        name: "description",
        content:
          "Content graph studio for Freedom Debt Relief and Achieve — entity conflicts, glossary ownership, and pre-publish gates.",
      },
      { name: "theme-color", content: "#0b0c0e" },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap",
      },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/__grok/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/__grok/icon-180.png" },
    ],
  }),
  component: () => (
    <html lang="en" className="antialiased" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="bg-bg text-fg">
        <PreviewHostBridge />
        <AuthProvider>
          <Outlet />
        </AuthProvider>
        <a
          href="/version"
          data-testid="build-footer"
          title={`Deployed commit ${BUILD_SHA}${BUILD_TIME ? ` · built ${BUILD_TIME}` : ""}`}
          className="fixed bottom-1 left-1/2 z-[80] -translate-x-1/2 rounded bg-bg/80 px-1.5 py-0.5 font-mono text-[10px] text-subtle hover:text-fg"
        >
          build {shortSha(BUILD_SHA)}
        </a>
        <Scripts />
      </body>
    </html>
  ),
});
