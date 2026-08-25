import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Three files only — no tree walk, no app `dist/` output. */
const FILES = ["pglite.data", "pglite.wasm", "initdb.wasm"];

export function copyPgliteAssets(root = process.cwd()) {
  const src = join(root, "node_modules/@electric-sql/pglite/dist");
  const func = join(root, ".vercel/output/functions/__server.func");
  const dest = join(func, "_libs");
  const out = join(root, ".vercel/output");
  if (!existsSync(src) || !existsSync(join(root, ".vercel/output/functions"))) return;
  mkdirSync(dest, { recursive: true });
  for (const name of FILES) {
    const from = join(src, name);
    const to = join(dest, name);
    if (!existsSync(from) || existsSync(to)) continue;
    cpSync(from, to);
  }

  const vc = join(func, ".vc-config.json");
  if (!existsSync(vc)) {
    writeFileSync(
      vc,
      JSON.stringify(
        {
          runtime: "nodejs22.x",
          handler: "index.mjs",
          launcherType: "Nodejs",
          shouldAddHelpers: false,
          supportsResponseStreaming: true,
          maxDuration: 60,
        },
        null,
        2,
      ),
    );
  }

  const cfg = join(out, "config.json");
  if (!existsSync(cfg)) {
    writeFileSync(
      cfg,
      JSON.stringify(
        {
          version: 3,
          routes: [
            { handle: "filesystem" },
            { src: "/(.*)", dest: "/__server" },
          ],
        },
        null,
        2,
      ),
    );
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  copyPgliteAssets();
}
