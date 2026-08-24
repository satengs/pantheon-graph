/**
 * Records Vite environment timings (client, ssr, nitro) and writes
 * public/data/build-metrics.json plus the Vercel static copy so the Gate
 * tab can show the last production build.
 */
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const PHASE_ORDER = ["client", "ssr", "nitro"];

function byteLen(source) {
  if (source == null) return 0;
  if (typeof source === "string") return Buffer.byteLength(source);
  if (typeof source.byteLength === "number") return source.byteLength;
  return Buffer.byteLength(String(source));
}

function dirBytes(dir) {
  if (!existsSync(dir)) return 0;
  let total = 0;
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    total += ent.isDirectory() ? dirBytes(p) : statSync(p).size;
  }
  return total;
}

function formatMs(ms) {
  if (ms >= 1000) return `${(ms / 1000).toFixed(ms >= 10_000 ? 1 : 2)}s`;
  return `${Math.round(ms)}ms`;
}

function formatBytes(n) {
  if (n >= 1_048_576) return `${(n / 1_048_576).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

export function buildMetricsPlugin(root = process.cwd()) {
  const wallStart = Date.now();
  /** @type {Record<string, { start: number, durationMs?: number, bytes: number, files: number }>} */
  const phases = Object.create(null);
  let written = false;

  function envName(ctx) {
    return ctx.environment?.name ?? "unknown";
  }

  function snapshot() {
    const rows = Object.entries(phases).map(([name, p]) => ({
      name,
      durationMs: p.durationMs ?? Math.round(performance.now() - p.start),
      bytes: p.bytes,
      files: p.files,
    }));
    rows.sort((a, b) => {
      const ia = PHASE_ORDER.indexOf(a.name);
      const ib = PHASE_ORDER.indexOf(b.name);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
    return {
      builtAt: new Date().toISOString(),
      totalMs: Date.now() - wallStart,
      phases: rows,
      output: {
        functionBytes: dirBytes(join(root, ".vercel/output/functions")),
        staticBytes: dirBytes(join(root, ".vercel/output/static")),
      },
    };
  }

  function write() {
    if (written) return;
    written = true;
    const payload = snapshot();
    const json = `${JSON.stringify(payload, null, 2)}\n`;
    const targets = [
      join(root, "public/data/build-metrics.json"),
      join(root, "src/data/build-metrics.json"),
      join(root, ".vercel/output/static/data/build-metrics.json"),
    ];
    for (const file of targets) {
      const dir = dirname(file);
      if (file.includes(".vercel/output") && !existsSync(join(root, ".vercel/output/static"))) {
        continue;
      }
      mkdirSync(dir, { recursive: true });
      writeFileSync(file, json);
    }
    const phaseLog = payload.phases.map((p) => `${p.name} ${formatMs(p.durationMs)}`).join(" · ");
    console.log(
      `[build-metrics] total ${formatMs(payload.totalMs)} · ${phaseLog || "no phases"}`,
    );
    console.log(
      `[build-metrics] function ${formatBytes(payload.output.functionBytes)} · static ${formatBytes(payload.output.staticBytes)}`,
    );
  }

  return {
    name: "origin:build-metrics",
    apply: "build",
    sharedDuringBuild: true,
    buildStart() {
      const name = envName(this);
      if (!phases[name]) {
        phases[name] = { start: performance.now(), bytes: 0, files: 0 };
      }
    },
    generateBundle(_opts, bundle) {
      const name = envName(this);
      const phase = phases[name] ?? (phases[name] = { start: performance.now(), bytes: 0, files: 0 });
      for (const item of Object.values(bundle)) {
        const src = item.type === "chunk" ? item.code : item.source;
        phase.bytes += byteLen(src);
        phase.files += 1;
      }
    },
    closeBundle() {
      const name = envName(this);
      const phase = phases[name];
      if (phase && phase.durationMs == null) {
        phase.durationMs = Math.round(performance.now() - phase.start);
      }
      if (name === "nitro") write();
    },
    buildEnd() {
      const name = envName(this);
      const phase = phases[name];
      if (phase && phase.durationMs == null) {
        phase.durationMs = Math.round(performance.now() - phase.start);
      }
    },
  };
}
