import { cpSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

/** Three files only — no tree walk, no app `dist/` output. */
const FILES = ["pglite.data", "pglite.wasm", "initdb.wasm"];

export function copyPgliteAssets(root = process.cwd()) {
  const src = join(root, "node_modules/@electric-sql/pglite/dist");
  const dest = join(root, ".vercel/output/functions/__server.func/_libs");
  if (!existsSync(src) || !existsSync(join(root, ".vercel/output/functions"))) return;
  mkdirSync(dest, { recursive: true });
  for (const name of FILES) {
    const from = join(src, name);
    if (existsSync(from)) cpSync(from, join(dest, name));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  copyPgliteAssets();
}
