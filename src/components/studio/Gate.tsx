import { useEffect, useState } from "react";
import { ISSUES } from "@/data/issues";
import { crawl } from "@/data/crawl";
import {
  buildTone,
  formatBytes,
  formatMs,
  seedBuildMetrics,
  type BuildMetrics,
} from "@/data/build-metrics";
import { Badge } from "@/components/ui/badge";
import { jaccard } from "@/lib/graph/model";

const PHASE_TONE: Record<string, string> = {
  client: "bg-accent",
  ssr: "bg-fdr",
  nitro: "bg-achieve",
};

export function Gate() {
  const openCritical = ISSUES.filter((i) => i.status === "open" && i.impact === "critical");
  const openHigh = ISSUES.filter((i) => i.status === "open" && i.impact === "high");
  const gloss = crawl.glossaryNear.map((n) => ({
    ...n,
    score: jaccard(n.fdr_slug, n.ach_slug),
  }));
  const blocked = openCritical.length > 0;
  const originFdr = {
    psi: 82,
    cacheHit: 0.71,
    conflicts: ISSUES.filter((i) => i.domain === "fdr" || i.domain === "both").filter(
      (i) => i.status === "open",
    ).length,
  };
  const originAch = {
    psi: 76,
    cacheHit: 0.41,
    conflicts: ISSUES.filter((i) => i.domain === "achieve" || i.domain === "both").filter(
      (i) => i.status === "open",
    ).length,
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
      <div className={`rounded-xl p-4 ${blocked ? "bg-danger/10" : "bg-ok/10"}`}>
        <p className="text-[10px] uppercase tracking-wide text-subtle">Pre-publish gate</p>
        <p className="mt-1 font-display text-3xl text-fg">{blocked ? "Blocked" : "Clear"}</p>
        <p className="mt-1 text-sm text-muted">
          {blocked
            ? `${openCritical.length} critical open items. Publish is refused until S01–S13 content owners land.`
            : "No critical L1/L2 items remain."}
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <OriginCard name="Freedom Debt Relief" psi={originFdr.psi} hit={originFdr.cacheHit} n={originFdr.conflicts} pass={originFdr.psi >= 80 && originFdr.conflicts === 0} />
        <OriginCard name="Achieve" psi={originAch.psi} hit={originAch.cacheHit} n={originAch.conflicts} pass={originAch.psi >= 80 && originAch.conflicts === 0} />
      </div>

      <BuildMetricsCard />

      <section>
        <h3 className="text-[11px] font-medium uppercase tracking-wide text-subtle">
          L2-GLOSS Jaccard
        </h3>
        <ul className="mt-2 divide-y divide-border">
          {gloss.length === 0 ? (
            <li className="py-2 text-sm text-muted">No near-duplicate slugs above threshold.</li>
          ) : (
            gloss.map((g) => (
              <li key={g.fdr_slug} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="font-mono text-xs text-muted">
                  {g.fdr_slug} ↔ {g.ach_slug}
                </span>
                <Badge tone={g.score >= 0.72 ? "danger" : "ok"}>{g.score.toFixed(2)}</Badge>
              </li>
            ))
          )}
        </ul>
      </section>

      <section>
        <h3 className="text-[11px] font-medium uppercase tracking-wide text-subtle">Open queue</h3>
        <ul className="mt-2 space-y-1">
          {[...openCritical, ...openHigh].map((i) => (
            <li key={i.id} className="flex items-center justify-between rounded-lg bg-raised px-3 py-2 text-sm">
              <span>
                <span className="font-mono text-xs">{i.code}</span> {i.title}
              </span>
              <Badge tone={i.impact === "critical" ? "danger" : "warn"}>{i.impact}</Badge>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function BuildMetricsCard() {
  const [metrics, setMetrics] = useState<BuildMetrics>(seedBuildMetrics);

  useEffect(() => {
    let cancelled = false;
    fetch("/data/build-metrics.json")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: BuildMetrics | null) => {
        if (!cancelled && data?.totalMs && Array.isArray(data.phases)) setMetrics(data);
      })
      .catch(() => {
        /* keep seed */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const tone = buildTone(metrics.totalMs);
  const maxMs = Math.max(...metrics.phases.map((p) => p.durationMs), 1);
  const built = new Date(metrics.builtAt);
  const builtLabel = Number.isNaN(built.getTime())
    ? metrics.builtAt
    : built.toISOString().replace("T", " ").slice(0, 16) + " UTC";

  return (
    <section className="rounded-xl bg-raised p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[11px] font-medium uppercase tracking-wide text-subtle">
          Nitro build
        </h3>
        <Badge tone={tone}>{formatMs(metrics.totalMs)}</Badge>
      </div>
      <p className="mt-1 font-display text-3xl text-fg">{formatMs(metrics.totalMs)}</p>
      <p className="mt-1 text-sm text-muted">{builtLabel}</p>

      <div className="mt-3 flex h-2 overflow-hidden rounded-sm bg-surface">
        {metrics.phases.map((p) => (
          <div
            key={p.name}
            title={`${p.name} ${formatMs(p.durationMs)}`}
            className={PHASE_TONE[p.name] ?? "bg-muted"}
            style={{ flexGrow: p.durationMs, flexBasis: 0 }}
          />
        ))}
      </div>

      <ul className="mt-3 space-y-1.5">
        {metrics.phases.map((p) => (
          <li key={p.name} className="flex items-center gap-3 text-sm">
            <span className={`size-1.5 shrink-0 rounded-full ${PHASE_TONE[p.name] ?? "bg-muted"}`} />
            <span className="w-16 font-mono text-xs uppercase text-muted">{p.name}</span>
            <span className="flex-1 font-mono tabular-nums text-fg">{formatMs(p.durationMs)}</span>
            <span className="font-mono tabular-nums text-muted">{formatBytes(p.bytes)}</span>
            <span
              className="hidden h-1.5 w-20 overflow-hidden rounded-sm bg-surface sm:block"
              aria-hidden
            >
              <span
                className={`block h-full ${PHASE_TONE[p.name] ?? "bg-muted"}`}
                style={{ width: `${Math.round((p.durationMs / maxMs) * 100)}%` }}
              />
            </span>
          </li>
        ))}
      </ul>

      <dl className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3 text-sm">
        <div>
          <dt className="text-subtle">Function</dt>
          <dd className="font-mono tabular-nums">{formatBytes(metrics.output.functionBytes)}</dd>
        </div>
        <div>
          <dt className="text-subtle">Static</dt>
          <dd className="font-mono tabular-nums">{formatBytes(metrics.output.staticBytes)}</dd>
        </div>
      </dl>
    </section>
  );
}

function OriginCard({
  name,
  psi,
  hit,
  n,
  pass,
}: {
  name: string;
  psi: number;
  hit: number;
  n: number;
  pass: boolean;
}) {
  return (
    <div className="rounded-xl bg-raised p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">{name}</h3>
        <Badge tone={pass ? "ok" : "danger"}>{pass ? "origin pass" : "origin fail"}</Badge>
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
        <div>
          <dt className="text-subtle">PSI</dt>
          <dd className="font-mono tabular-nums">{psi}</dd>
        </div>
        <div>
          <dt className="text-subtle">CF hit</dt>
          <dd className="font-mono tabular-nums">{Math.round(hit * 100)}%</dd>
        </div>
        <div>
          <dt className="text-subtle">Open L2</dt>
          <dd className="font-mono tabular-nums">{n}</dd>
        </div>
      </dl>
    </div>
  );
}
