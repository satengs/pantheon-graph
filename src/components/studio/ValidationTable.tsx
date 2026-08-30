import { Maximize2, Minimize2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { RULES } from "@/data/rules-seed";
import { ISSUE_PROOFS } from "@/data/issue-proofs";
import { ISSUE_ALIAS } from "@/lib/graph/aliases";
import { useStudio } from "@/store/studio";
import { cmp, filterIssues } from "@/lib/studio/query";
import { ValidatePanel } from "@/components/studio/ValidatePanel";
import { crawl } from "@/data/crawl";
import { crawlMetrics, pct } from "@/lib/studio/crawl-metrics";
import { issueFitsFamily, isSeedFamily } from "@/lib/org/catalog";
import { EmptyFamilyCrawl } from "@/components/studio/EmptyFamilyCrawl";
import { IssueRow, issueRowFromRule } from "@/components/studio/IssueDrawer";

const SORTS: { key: string; label: string }[] = [
  { key: "page", label: "Page" },
  { key: "title", label: "What" },
  { key: "code", label: "ID" },
  { key: "domain", label: "Brand" },
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
  const hoverIssue = useStudio((s) => s.hoverIssue);
  const selectedIssueIds = useStudio((s) => s.selectedIssueIds);
  const toggleIssueSelect = useStudio((s) => s.toggleIssueSelect);
  const sortKey = useStudio((s) => s.sortKey);
  const sortDir = useStudio((s) => s.sortDir);
  const setSort = useStudio((s) => s.setSort);
  const maximized = useStudio((s) => s.maximized);
  const setMaximized = useStudio((s) => s.setMaximized);
  const graphOrg = useStudio((s) => s.graphOrg);
  const parentSlug = useStudio((s) => s.parentSlug);
  const attachedRuleCodes = useStudio((s) => s.attachedRuleCodes);
  const selectIssue = useStudio((s) => s.selectIssue);
  const seedFamily = isSeedFamily(graphOrg, parentSlug);
  const metrics = crawlMetrics(crawl);

  const rows = filterIssues(RULES, { brand, product, layer, impact, query, codes: attachedRuleCodes })
    .filter((r) => issueFitsFamily(r, graphOrg, parentSlug))
    .slice()
    .sort((a, b) => {
      const ra = issueRowFromRule(a, graphOrg);
      const rb = issueRowFromRule(b, graphOrg);
      const map: Record<string, string> = {
        code: a.code,
        alias: ISSUE_ALIAS[a.code] ?? a.code,
        domain: a.domain,
        product: String(a.product),
        page: ra.pagePath,
        title: a.title,
        proof: ISSUE_PROOFS[a.code]?.rows[0]?.h1 ?? a.reason,
        impact: a.impact,
        status: a.status,
      };
      const mb: Record<string, string> = {
        code: b.code,
        alias: ISSUE_ALIAS[b.code] ?? b.code,
        domain: b.domain,
        product: String(b.product),
        page: rb.pagePath,
        title: b.title,
        proof: ISSUE_PROOFS[b.code]?.rows[0]?.h1 ?? b.reason,
        impact: b.impact,
        status: b.status,
      };
      return cmp(map[sortKey] ?? a.code, mb[sortKey] ?? b.code, sortDir);
    });

  if (!seedFamily) {
    return (
      <div className="min-h-0 flex-1 overflow-auto">
        <ValidatePanel />
        <EmptyFamilyCrawl
          title={`No seed crawl for ${graphOrg?.parent?.name ?? "this family"}`}
          detail="Run checks on the brand homepages. Findings show here and on Issues. FDR × Achieve seed rows stay on Pantheon."
        />
      </div>
    );
  }

  return (
    <div className={`min-h-0 flex-1 overflow-auto ${maximized === "validation" ? "fixed inset-0 z-50 bg-bg" : ""}`}>
      <ValidatePanel />
      <div className="grid grid-cols-2 gap-2 border-b border-border px-3 py-2 sm:grid-cols-4">
        <Metric label="Overlap error" value={pct(metrics.glossary.overlapRate)} hint={`${metrics.glossary.overlap} of ${metrics.glossary.fdr} FDR glossary slugs also on Achieve`} />
        <Metric label="Path clones" value={String(metrics.clones.exact)} hint="Exact paths in both sitemaps" />
        <Metric label="Schema miss" value={pct(metrics.schema.schemaErrorRate)} hint="Achieve glossary share with no JSON-LD template" />
        <Metric label="Gate fail" value={pct(metrics.gate.failRate)} hint={`${metrics.gate.open} open / ${metrics.gate.rules} rules · ${metrics.gate.critical} critical`} />
      </div>
      <p className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2 text-xs text-muted">
        <span>
          {rows.length} of {RULES.length} · last crawl {metrics.crawledAt.slice(0, 10)} · page first
        </span>
        <span className="flex flex-wrap items-center gap-1.5">
          {SORTS.map((c) => (
            <button
              key={c.key}
              type="button"
              className={`h-7 rounded-md px-2 ${sortKey === c.key ? "bg-accent text-accent-fg" : "bg-raised text-muted"}`}
              onClick={() => setSort(c.key)}
            >
              {c.label}
              {sortKey === c.key ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
            </button>
          ))}
          <button type="button" className="inline-flex items-center gap-1 text-fg" onClick={() => setMaximized(maximized === "validation" ? null : "validation")}>
            {maximized === "validation" ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
            {maximized === "validation" ? "Exit" : "Full screen"}
          </button>
        </span>
      </p>
      <div>
        {rows.map((i) => {
          const row = issueRowFromRule(i, graphOrg);
          return (
            <IssueRow
              key={i.id}
              row={row}
              selected={selectedIssueId === i.id}
              onOpen={() => selectIssue(i.id)}
              onHover={(on) => hoverIssue(on ? i.id : null)}
              leading={
                <span className="pt-1" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--color-accent)]"
                    checked={selectedIssueIds.includes(i.id)}
                    onChange={() => toggleIssueSelect(i.id)}
                    aria-label={`Select ${i.code}`}
                  />
                </span>
              }
            />
          );
        })}
      </div>
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
