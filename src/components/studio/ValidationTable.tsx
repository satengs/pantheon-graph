import { ExternalLink, Maximize2, Minimize2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { RULES } from "@/data/rules-seed";
import { ISSUE_PROOFS } from "@/data/issue-proofs";
import { ISSUE_ALIAS } from "@/lib/graph/aliases";
import { Badge } from "@/components/ui/badge";
import { useStudio } from "@/store/studio";
import { PRODUCT_LABEL } from "@/lib/graph/types";
import { cmp, filterIssues } from "@/lib/studio/query";
import type { BacklogItem } from "@/lib/graph/types";
import { ValidatePanel } from "@/components/studio/ValidatePanel";
import { crawl } from "@/data/crawl";
import { crawlMetrics, pct } from "@/lib/studio/crawl-metrics";

const COLS: { key: string; label: string }[] = [
  { key: "code", label: "ID" },
  { key: "alias", label: "Type" },
  { key: "domain", label: "Brand" },
  { key: "product", label: "Product" },
  { key: "proof", label: "Proof" },
  { key: "impact", label: "Impact" },
  { key: "status", label: "Status" },
];

export function ValidationTable() {
  const brand = useStudio((s) => s.brand);
  const product = useStudio((s) => s.product);
  const layer = useStudio((s) => s.layer);
  const impact = useStudio((s) => s.impact);
  const query = useStudio((s) => s.query);
  const selectedIssueId = useStudio((s) => s.selectedIssueId);
  const selectIssue = useStudio((s) => s.selectIssue);
  const hoverIssue = useStudio((s) => s.hoverIssue);
  const selectedIssueIds = useStudio((s) => s.selectedIssueIds);
  const toggleIssueSelect = useStudio((s) => s.toggleIssueSelect);
  const sortKey = useStudio((s) => s.sortKey);
  const sortDir = useStudio((s) => s.sortDir);
  const setSort = useStudio((s) => s.setSort);
  const maximized = useStudio((s) => s.maximized);
  const setMaximized = useStudio((s) => s.setMaximized);
  const metrics = crawlMetrics(crawl);

  const rows = filterIssues(RULES, { brand, product, layer, impact, query }).slice().sort((a, b) => {
    const aliasA = ISSUE_ALIAS[a.code] ?? a.code;
    const aliasB = ISSUE_ALIAS[b.code] ?? b.code;
    const map: Record<string, string> = {
      code: a.code,
      alias: aliasA,
      domain: a.domain,
      product: String(a.product),
      proof: ISSUE_PROOFS[a.code]?.rows[0]?.h1 ?? a.reason,
      impact: a.impact,
      status: a.status,
    };
    const mb: Record<string, string> = {
      code: b.code,
      alias: aliasB,
      domain: b.domain,
      product: String(b.product),
      proof: ISSUE_PROOFS[b.code]?.rows[0]?.h1 ?? b.reason,
      impact: b.impact,
      status: b.status,
    };
    return cmp(map[sortKey] ?? a.code, mb[sortKey] ?? b.code, sortDir);
  });

  return (
    <div className={`min-h-0 flex-1 overflow-auto ${maximized === "validation" ? "fixed inset-0 z-50 bg-bg" : ""}`}>
      <ValidatePanel />
      <div className="grid grid-cols-2 gap-2 border-b border-border px-3 py-2 sm:grid-cols-4">
        <Metric label="Overlap error" value={pct(metrics.glossary.overlapRate)} hint={`${metrics.glossary.overlap} of ${metrics.glossary.fdr} FDR glossary slugs also on Achieve`} />
        <Metric label="Path clones" value={String(metrics.clones.exact)} hint="Exact paths in both sitemaps" />
        <Metric label="Schema miss" value={pct(metrics.schema.schemaErrorRate)} hint="Achieve glossary share with no JSON-LD template" />
        <Metric label="Gate fail" value={pct(metrics.gate.failRate)} hint={`${metrics.gate.open} open / ${metrics.gate.rules} rules · ${metrics.gate.critical} critical`} />
      </div>
      <p className="flex items-center justify-between border-b border-border px-3 py-2 text-xs text-muted">
        <span>
          {rows.length} of {RULES.length} · last crawl {metrics.crawledAt.slice(0, 10)} · click a header to sort
        </span>
        <button type="button" className="inline-flex items-center gap-1 text-fg" onClick={() => setMaximized(maximized === "validation" ? null : "validation")}>
          {maximized === "validation" ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
          {maximized === "validation" ? "Exit" : "Full screen"}
        </button>
      </p>
      <table className="w-full min-w-[880px] table-fixed border-collapse text-left text-sm">
        <thead className="sticky top-0 bg-surface text-[10px] uppercase tracking-wide text-subtle">
          <tr>
            <th className="w-8 px-3 py-2 font-medium" />
            {COLS.map((c) => (
              <th key={c.key} className={`px-2 py-2 font-medium ${c.key === "proof" ? "w-[38%]" : ""}`}>
                <button type="button" className="inline-flex items-center gap-1" onClick={() => setSort(c.key)}>
                  {c.label}
                  {sortKey === c.key ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((i) => {
            const proof = ISSUE_PROOFS[i.code];
            const shot = proof?.rows[0];
            return (
              <tr
                key={i.id}
                onClick={() => selectIssue(i.id)}
                onMouseEnter={() => hoverIssue(i.id)}
                onMouseLeave={() => hoverIssue(null)}
                title={`${i.code} · ${i.title}\n${proof?.conflict ?? i.reason}`}
                className={`cursor-pointer border-t border-border/80 hover:bg-raised/70 ${
                  selectedIssueId === i.id ? "bg-raised" : ""
                }`}
              >
                <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--color-accent)]"
                    checked={selectedIssueIds.includes(i.id)}
                    onChange={() => toggleIssueSelect(i.id)}
                    aria-label={`Select ${i.code}`}
                  />
                </td>
                <td className="px-2 py-3 font-mono text-xs text-fg">{i.code}</td>
                <td className="px-2 py-3 text-fg">{ISSUE_ALIAS[i.code] ?? i.title}</td>
                <td className="px-2 py-3">
                  <Badge tone={i.domain === "fdr" ? "fdr" : i.domain === "achieve" ? "achieve" : "neutral"}>
                    {i.domain === "both" ? "common" : i.domain}
                  </Badge>
                </td>
                <td className="px-2 py-3 text-muted">{i.product === "all" ? "all" : PRODUCT_LABEL[i.product]}</td>
                <td className="px-2 py-3">
                  {shot ? (
                    <span className="block">
                      <span className="text-fg">{shot.h1}</span>
                      <span className="mt-0.5 block font-mono text-[10px] text-subtle line-clamp-2">
                        {shot.canonical.replace(/^https:\/\//, "")} · {shot.extra}
                      </span>
                    </span>
                  ) : (
                    <span className="line-clamp-2 text-muted">{i.reason}</span>
                  )}
                </td>
                <td className="px-2 py-3">
                  <Badge tone={i.impact === "critical" ? "danger" : i.impact === "high" ? "warn" : "neutral"}>
                    {i.impact}
                  </Badge>
                </td>
                <td className="px-2 py-3">
                  <div className="flex items-center gap-2">
                    <Badge tone={i.status === "open" ? "danger" : "ok"}>{i.status}</Badge>
                    {i.urls[0] ? (
                      <a
                        href={i.urls[0]}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex text-fdr hover:underline"
                      >
                        <ExternalLink className="size-3.5" />
                      </a>
                    ) : (
                      <Link to="/empty" search={{ q: i.code }} onClick={(e) => e.stopPropagation()} className="text-[10px] text-subtle">
                        empty
                      </Link>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length === 0 ? (
        <div className="p-8 text-center">
          <p className="text-sm text-muted">No rules match these filters.</p>
          <Link to="/empty" search={{ q: query || `${brand}/${product}/${layer}` }} className="mt-2 inline-block text-sm text-fdr hover:underline">
            Open empty-data page
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div title={hint}>
      <p className="text-[10px] uppercase tracking-wide text-subtle">{label}</p>
      <p className="font-mono text-sm text-fg">{value}</p>
    </div>
  );
}
