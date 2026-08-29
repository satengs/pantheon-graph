import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useStudio } from "@/store/studio";
import { listStudio, upsertTask } from "@/lib/server/studio-db";
import { analyzePage } from "@/lib/server/analyze-page";
import { cmp, filterIssues } from "@/lib/studio/query";
import { ISSUE_ALIAS } from "@/lib/graph/aliases";
import { RULES } from "@/data/rules-seed";
import { issueFitsFamily, isSeedFamily, urlInFamily } from "@/lib/org/catalog";
import { EmptyFamilyCrawl } from "@/components/studio/EmptyFamilyCrawl";

type Finding = {
  id: string;
  code: string;
  title: string;
  lane: string;
  url: string;
  why: string;
  found: string;
  suggested: string;
};

export function Backlog() {
  const brand = useStudio((s) => s.brand);
  const product = useStudio((s) => s.product);
  const layer = useStudio((s) => s.layer);
  const impact = useStudio((s) => s.impact);
  const query = useStudio((s) => s.query);
  const selectIssue = useStudio((s) => s.selectIssue);
  const selectFinding = useStudio((s) => s.selectFinding);
  const selectedFindingId = useStudio((s) => s.selectedFindingId);
  const hoverIssue = useStudio((s) => s.hoverIssue);
  const attachedRuleCodes = useStudio((s) => s.attachedRuleCodes);
  const graphOrg = useStudio((s) => s.graphOrg);
  const parentSlug = useStudio((s) => s.parentSlug);
  const seedFamily = isSeedFamily(graphOrg, parentSlug);
  const sortKey = useStudio((s) => s.sortKey);
  const sortDir = useStudio((s) => s.sortDir);
  const setSort = useStudio((s) => s.setSort);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [title, setTitle] = useState("");
  const familyHome = graphOrg?.brands[0]?.url || graphOrg?.parent?.url || "https://www.freedomdebtrelief.com/debt-relief/";
  const [url, setUrl] = useState(familyHome);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const points = useMemo(() => {
    const rules = seedFamily
      ? filterIssues(RULES, { brand, product, layer, impact, query, codes: attachedRuleCodes })
          .filter((r) => issueFitsFamily(r, graphOrg, parentSlug))
          .map((r) => ({
      id: r.id,
      code: r.code,
      title: r.title,
      alias: ISSUE_ALIAS[r.code] ?? r.code,
      kind: "rule" as const,
      why: r.reason,
      impact: r.impact,
      layer: r.layer,
      domain: r.domain,
      product: r.product,
      url: r.urls[0] ?? "",
    }))
      : [];
    const q = query.trim().toLowerCase();
    const html = findings
      .filter((f) => (seedFamily ? true : urlInFamily(f.url, graphOrg)))
      .filter((f) => !q || `${f.title} ${f.why} ${f.url} ${f.code}`.toLowerCase().includes(q))
      .map((f) => ({
        id: f.id,
        code: f.code,
        title: f.title,
        alias: ISSUE_ALIAS[f.code] ?? f.code,
        kind: "html" as const,
        why: f.why,
        impact: "high" as const,
        layer: "L1",
        domain: f.lane,
        product: "all",
        url: f.url,
      }));
    const all = [...html, ...rules];
    const IMPACT: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    return all.sort((a, b) => {
      if (sortKey === "impact") return cmp(IMPACT[a.impact] ?? 9, IMPACT[b.impact] ?? 9, sortDir);
      const av = String((a as Record<string, string>)[sortKey] ?? a.code);
      const bv = String((b as Record<string, string>)[sortKey] ?? b.code);
      return cmp(av, bv, sortDir);
    });
  }, [brand, product, layer, impact, query, findings, sortKey, sortDir, attachedRuleCodes, seedFamily, graphOrg, parentSlug]);

  async function reload() {
    try {
      const data = await listStudio();
      setFindings(data.findings);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load issues");
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto p-4">
      <p className="text-sm text-muted">
        Validation points for this family — HTML outline mistakes and content rules. Click one to view the issue.
      </p>
      {err ? <p className="mt-2 text-sm text-danger">{err}</p> : null}
      {!seedFamily && points.length === 0 ? (
        <div className="mt-4">
          <EmptyFamilyCrawl title={`No issues for ${graphOrg?.parent?.name ?? "this family"}`} />
        </div>
      ) : null}
      <form
        className="mt-3 flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return;
          void upsertTask({ data: { title: title.trim() } }).then(() => {
            setTitle("");
            void reload();
          });
        }}
      >
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a validation point"
          className="h-9 min-w-[200px] flex-1 rounded-md bg-surface px-3 text-sm shadow-[var(--shadow-border)]"
        />
        <Button type="submit" size="sm">
          Add
        </Button>
      </form>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="h-9 min-w-[220px] flex-1 rounded-md bg-surface px-3 text-sm shadow-[var(--shadow-border)]"
        />
        <Button
          size="sm"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void analyzePage({ data: { url } })
              .then((res) => {
                void reload();
                if (res.findings[0]) selectFinding(res.findings[0].id);
              })
              .catch((e: unknown) => setErr(e instanceof Error ? e.message : "Analyze failed"))
              .finally(() => setBusy(false));
          }}
        >
          {busy ? "Reading…" : "Run outline"}
        </Button>
      </div>
      <p className="mt-3 text-xs text-subtle">Click a column header to sort. Click again to reverse.</p>
      <div className="mt-2 min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[960px] table-fixed border-collapse text-left text-sm">
          <thead className="sticky top-0 bg-surface text-[10px] uppercase tracking-wide text-subtle">
            <tr>
              {[
                ["code", "ID"],
                ["alias", "Type"],
                ["title", "Title"],
                ["kind", "Source"],
                ["layer", "Layer"],
                ["domain", "Brand"],
                ["product", "Product"],
                ["impact", "Impact"],
                ["url", "URL"],
              ].map(([key, label]) => (
                <th key={key} className="px-2 py-2 font-medium">
                  <button type="button" className="inline-flex items-center gap-1" onClick={() => setSort(key)}>
                    {label}
                    {sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr
                key={p.id}
                onClick={() => {
                  if (p.kind === "html") selectFinding(p.id);
                  else {
                    selectFinding(null);
                    selectIssue(p.id);
                  }
                }}
                onMouseEnter={() => p.kind === "rule" && hoverIssue(p.id)}
                onMouseLeave={() => hoverIssue(null)}
                className={`cursor-pointer border-t border-border/80 hover:bg-raised/70 ${
                  selectedFindingId === p.id ? "bg-raised" : ""
                }`}
              >
                <td className="px-2 py-2 font-mono text-xs">{p.code}</td>
                <td className="px-2 py-2 text-xs text-muted">{p.alias}</td>
                <td className="px-2 py-2 font-medium">{p.title}</td>
                <td className="px-2 py-2">
                  <Badge tone={p.kind === "html" ? "warn" : "neutral"}>{p.kind === "html" ? "HTML" : "rule"}</Badge>
                </td>
                <td className="px-2 py-2 text-xs">{p.layer}</td>
                <td className="px-2 py-2 text-xs">{p.domain}</td>
                <td className="px-2 py-2 text-xs">{p.product}</td>
                <td className="px-2 py-2">
                  <Badge tone={p.impact === "critical" ? "danger" : "warn"}>{p.impact}</Badge>
                </td>
                <td className="truncate px-2 py-2 text-[11px] text-muted" title={p.url}>
                  {p.url.replace(/^https?:\/\//, "")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
