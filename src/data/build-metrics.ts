import seed from "./build-metrics.json";

export type BuildPhase = {
  name: string;
  durationMs: number;
  bytes: number;
  files: number;
};

export type BuildMetrics = {
  builtAt: string;
  totalMs: number;
  phases: BuildPhase[];
  output: {
    functionBytes: number;
    staticBytes: number;
  };
};

export const seedBuildMetrics = seed as BuildMetrics;

export function formatMs(ms: number): string {
  if (ms >= 10_000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  return `${Math.round(ms)}ms`;
}

export function formatBytes(n: number): string {
  if (n >= 1_048_576) return `${(n / 1_048_576).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

export function buildTone(totalMs: number): "ok" | "warn" | "danger" {
  if (totalMs >= 15_000) return "danger";
  if (totalMs >= 5_000) return "warn";
  return "ok";
}
