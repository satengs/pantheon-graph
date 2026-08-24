import { cpSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

/** PGLite loads ./pglite.data next to the bundled module via import.meta.url. */
const FILES = ["pglite.data", "pglite.wasm", "initdb.wasm"];

export function copyPgliteAssets(root = process.cwd()) {
  const src = join(root, "node_modules/@electric-sql/pglite/dist");
  const dests = [
    join(root, ".vercel/output/functions/__server.func/_libs"),
    join(root, ".vercel/output/functions/__server.func"),
  ];
  for (const dest of dests) {
    mkdirSync(dest, { recursive: true });
    for (const name of FILES) {
      const from = join(src, name);
      if (!existsSync(from)) continue;
      cpSync(from, join(dest, name));
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  copyPgliteAssets();
}
