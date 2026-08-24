/**
 * Fill Vercel runtime blanks so a Git/CLI deploy matches live preview.
 * Project env always wins. Origin ships with auth off and no database —
 * an unset VITE_AUTH_ENABLED would otherwise enable Better Auth on the server.
 */
if (!process.env.VITE_AUTH_ENABLED?.trim()) {
  process.env.VITE_AUTH_ENABLED = "false";
}

export default function deployEnvPlugin() {}
