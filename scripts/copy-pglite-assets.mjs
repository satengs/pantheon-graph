import { cpSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

/** PGLite loads pglite.data next to the bundle. Copy it beside every copy of the module. */
const FILES = ["pglite.data", "pglite.wasm", "initdb.wasm"];

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(p, out);
    else if (name.includes("electric-sql__pglite") || name === "pglite.mjs") out.push(p);
  }
  return out;
}

export function copyPgliteAssets(root = process.cwd()) {
  const src = join(root, "node_modules/@electric-sql/pglite/dist");
  const dests = new Set([
    join(root, ".vercel/output/functions/__server.func/_libs"),
    join(root, ".vercel/output/functions/__server.func"),
    join(root, ".output/server"),
    join(root, ".output/server/_libs"),
  ]);
  for (const bundle of [
    ...walk(join(root, ".vercel/output")),
    ...walk(join(root, ".output")),
  ]) {
    dests.add(dirname(bundle));
  }
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
