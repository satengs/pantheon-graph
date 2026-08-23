import { ExternalLink, Copy, Check } from "lucide-react";
import { useMemo, useState } from "react";
import { ISSUES } from "@/data/issues";
import { crawl } from "@/data/crawl";
import { buildGraph, mcpShort, toneRatio } from "@/lib/graph/model";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useStudio } from "@/store/studio";
import { BRAND_LABEL, PRODUCT_LABEL } from "@/lib/graph/types";
import { runPsi } from "@/lib/server/ops";

export function Inspector() {
  const explode = useStudio((s) => s.explode);
  const brand = useStudio((s) => s.brand);
  const product = useStudio((s) => s.product);
  const layer = useStudio((s) => s.layer);
  const selectedNodeId = useStudio((s) => s.selectedNodeId);
  const selectedIssueId = useStudio((s) => s.selectedIssueId);
  const selectIssue = useStudio((s) => s.selectIssue);
  const [copied, setCopied] = useState(false);
  const [psiLive, setPsiLive] = useState<number | null>(null);
  const [psiBusy, setPsiBusy] = useState(false);

  const graph = useMemo(
    () => buildGraph({ explode, brand, product, layer }),
    [explode, brand, product, layer],
  );
  const node = graph.nodes.find((n) => n.id === selectedNodeId) ?? null;
  const issue = ISSUES.find((i) => i.id === (node?.issueId ?? selectedIssueId)) ?? ISSUES[0]!;
  const short = node ? mcpShort(node) : mcpShort({
    id: `issue:${issue.id}`,
    label: `${issue.code} ${issue.title}`,
    kind: "issue",
    issueId: issue.id,
  });
  const toneText = `${issue.title} ${issue.reason} ${issue.fix}`;
  const toneBrand = issue.domain === "achieve" ? "achieve" : "fdr";
  const tone = toneRatio(toneText, toneBrand);

  async function copyShort() {
    await navigator.clipboard.writeText(short);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  async function fetchPsi() {
    const url = node?.url ?? issue.urls[0];
    if (!url) return;
    setPsiBusy(true);
    try {
      const res = await runPsi({ data: url });
      if (res.ok) setPsiLive(res.performance);
    } catch {
      setPsiLive(null);
    } finally {
      setPsiBusy(false);
    }
  }

  return (
    <aside className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto p-4">
      <header>
        <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-subtle">Inspector</p>
        <h2 className="mt-1 font-display text-xl leading-tight text-fg text-balance">
          {node ? node.label.replace("\n", " ") : issue.title}
        </h2>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Badge tone={issue.layer === "L2" ? "warn" : "neutral"}>{issue.layer}</Badge>
          <Badge
            tone={
              issue.domain === "fdr" ? "fdr" : issue.domain === "achieve" ? "achieve" : "neutral"
            }
          >
            {issue.domain}
          </Badge>
          <Badge>{issue.product === "all" ? "all products" : PRODUCT_LABEL[issue.product]}</Badge>
          <Badge tone={issue.impact === "critical" ? "danger" : issue.impact === "high" ? "warn" : "neutral"}>
            {issue.impact}
          </Badge>
        </div>
      </header>

      {node?.url ? (
        <a
          href={node.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-fdr hover:underline"
        >
          Open live page <ExternalLink className="size-3.5" />
        </a>
      ) : null}

      <section>
        <h3 className="text-[11px] font-medium uppercase tracking-wide text-subtle">Reason</h3>
        <p className="mt-1 text-sm leading-relaxed text-muted text-pretty">{issue.reason}</p>
        <h3 className="mt-3 text-[11px] font-medium uppercase tracking-wide text-subtle">Fix</h3>
        <p className="mt-1 text-sm leading-relaxed text-fg text-pretty">{issue.fix}</p>
      </section>

      <section className="rounded-lg bg-raised p-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-[11px] font-medium uppercase tracking-wide text-subtle">
            Acceptance
          </h3>
          <div className="flex gap-1.5">
            <Badge tone={issue.acceptance.originPass ? "ok" : "danger"}>
              origin {issue.acceptance.originPass ? "pass" : "fail"}
            </Badge>
            <Badge tone={issue.acceptance.pagePass ? "ok" : "danger"}>
              page {issue.acceptance.pagePass ? "pass" : "fail"}
            </Badge>
          </div>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <div>
            <dt className="text-subtle">PageSpeed</dt>
            <dd className="font-mono tabular-nums text-fg">
              {psiLive ?? issue.acceptance.psi.performance}
            </dd>
          </div>
          <div>
            <dt className="text-subtle">LCP</dt>
            <dd className="font-mono tabular-nums text-fg">{issue.acceptance.psi.lcpMs} ms</dd>
          </div>
          <div>
            <dt className="text-subtle">CWV</dt>
            <dd className="uppercase">{issue.acceptance.cwv}</dd>
          </div>
          <div>
            <dt className="text-subtle">Cloudflare</dt>
            <dd className="font-mono">{issue.acceptance.cache}</dd>
          </div>
        </dl>
        <Button
          variant="ghost"
          size="sm"
          className="mt-2 w-full"
          onClick={() => void fetchPsi()}
          disabled={psiBusy}
        >
          {psiBusy ? "Fetching PageSpeed…" : "Fetch live PageSpeed"}
        </Button>
      </section>

      <section>
        <div className="flex items-center justify-between">
          <h3 className="text-[11px] font-medium uppercase tracking-wide text-subtle">
            Tone tokens · {BRAND_LABEL[toneBrand]}
          </h3>
          <span className="font-mono text-xs tabular-nums text-muted">
            {(tone.ratio * 100).toFixed(0)}% on-brand
          </span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-raised">
          <div
            className="h-full rounded-full bg-accent"
            style={{ width: `${Math.round(tone.ratio * 100)}%` }}
          />
        </div>
        <p className="mt-1 text-xs text-subtle">
          {tone.on} on-brand · {tone.off} off-brand · fail if ratio under 72%
        </p>
      </section>

      <section>
        <div className="flex items-center justify-between">
          <h3 className="text-[11px] font-medium uppercase tracking-wide text-subtle">
            MCP short
          </h3>
          <Button variant="ghost" size="sm" onClick={() => void copyShort()}>
            {copied ? <Check /> : <Copy />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <pre className="mt-1 overflow-x-auto rounded-lg bg-bg p-3 font-mono text-[11px] leading-relaxed text-muted">
          {short}
        </pre>
      </section>

      <section>
        <h3 className="text-[11px] font-medium uppercase tracking-wide text-subtle">
          Citations
        </h3>
        <ul className="mt-2 flex flex-col gap-2">
          {issue.citations.map((c) => (
            <li key={c.url + c.location} className="rounded-lg bg-raised p-3">
              <div className="flex items-center justify-between gap-2">
                <Badge tone={c.brand === "fdr" ? "fdr" : "achieve"}>{c.brand}</Badge>
                <span className="text-[10px] uppercase tracking-wide text-subtle">{c.location}</span>
              </div>
              <blockquote className="mt-2 text-sm text-fg text-pretty">“{c.quote}”</blockquote>
              <p className="mt-1 text-xs text-muted text-pretty">{c.whyReal}</p>
              <a
                href={c.url}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-xs text-fdr hover:underline"
              >
                {c.url.replace("https://www.", "")} <ExternalLink className="size-3" />
              </a>
            </li>
          ))}
        </ul>
      </section>

      <p className="text-[10px] text-subtle">
        Graph version {crawl.crawledAt} · {crawl.counts.fdr} FDR · {crawl.counts.achieve} Achieve
      </p>
      <div className="flex flex-wrap gap-1">
        {ISSUES.map((i) => (
          <button
            key={i.id}
            type="button"
            onClick={() => selectIssue(i.id)}
            className={`h-7 rounded-sm px-2 font-mono text-[10px] ${
              issue.id === i.id ? "bg-accent text-accent-fg" : "bg-raised text-muted"
            }`}
          >
            {i.code}
          </button>
        ))}
      </div>
    </aside>
  );
}
