/**
 * Fill Vercel runtime blanks so a Git/CLI deploy matches live preview.
 * Project env always wins. Auth is on; leave VITE_AUTH_ENABLED unset to enable.
 */
if (!process.env.VITE_AUTH_ENABLED?.trim()) {
  process.env.VITE_AUTH_ENABLED = "true";
}

export default function deployEnvPlugin() {}
