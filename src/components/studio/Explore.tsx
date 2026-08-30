import { useEffect, useMemo, useState } from "react";
import { Compass, Copy, Check, Maximize2, Minimize2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useStudio } from "@/store/studio";
import {
  formatSuggestionsJson,
  formatSuggestionsMarkdown,
  suggestionRows,
  type SuggestionRow,
} from "@/lib/graph/suggestions";
import { RULES } from "@/data/rules-seed";
import { runValidation } from "@/lib/server/validate-run";
import { listStudio } from "@/lib/server/studio-db";
import { cmp } from "@/lib/studio/query";
import { isSeedFamily } from "@/lib/org/catalog";
import { EmptyFamilyCrawl } from "@/components/studio/EmptyFamilyCrawl";
import { IssueRow, issueRowFromRule } from "@/components/studio/IssueDrawer";
import { formatIssueListRow } from "@/lib/studio/issue-detail";

const SORTS: { key: string; label: string }[] = [
  { key: "page", label: "Page" },
  { key: "code", label: "ID" },
  { key: "kind", label: "Kind" },
  { key: "hits", label: "Hits" },
];

export function Explore() {
  const brand = useStudio((s) => s.brand);
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
  const parentId = useStudio((s) => s.parentId);
  const selectIssue = useStudio((s) => s.selectIssue);
  const seedFamily = isSeedFamily(graphOrg, parentSlug);
  const [kind, setKind] = useState<"all" | "conflict" | "suggests" | "sameAs">("all");
  const [copied, setCopied] = useState<"md" | "json" | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [hits, setHits] = useState<Record<string, number>>({});

  useEffect(() => {
    void listStudio()
      .then((d) => {
        const next: Record<string, number> = {};
        for (const f of d.findings) next[f.code] = (next[f.code] ?? 0) + 1;
        setHits(next);
      })
      .catch(() => setHits({}));
  }, [note]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return suggestionRows()
      .filter((r) => {
        if (kind !== "all" && r.kind !== kind) return false;
        if (layer !== "all" && r.layer !== layer) return false;
        if (impact !== "all" && r.impact !== impact) return false;
        if (brand === "fdr" && !/fdr|Freedom|both|common/i.test(`${r.from} ${r.to} ${r.code}`)) return false;
        if (brand === "achieve" && !/achieve|both|common/i.test(`${r.from} ${r.to} ${r.code}`)) return false;
        if (q && !`${r.code} ${r.alias} ${r.from} ${r.to} ${r.proof}`.toLowerCase().includes(q)) return false;
        return true;
      })
      .slice()
      .sort((a, b) => {
        const ruleA = RULES.find((x) => x.code === a.code);
        const ruleB = RULES.find((x) => x.code === b.code);
        const pageA = ruleA ? issueRowFromRule(ruleA, graphOrg).pagePath : a.from;
        const pageB = ruleB ? issueRowFromRule(ruleB, graphOrg).pagePath : b.from;
        const av = sortKey === "hits" ? String(hits[a.code] ?? 0) : sortKey === "page" ? pageA : String(a[sortKey as keyof SuggestionRow] ?? "");
        const bv = sortKey === "hits" ? String(hits[b.code] ?? 0) : sortKey === "page" ? pageB : String(b[sortKey as keyof SuggestionRow] ?? "");
        return cmp(av, bv, sortDir);
      });
  }, [kind, layer, impact, brand, query, sortKey, sortDir, hits, graphOrg]);

  const selected = rows.filter((r) => selectedIssueIds.includes(r.code));
  const exportRows = selected.length ? selected : rows;

  if (!seedFamily) {
    return <EmptyFamilyCrawl title={`No explore crawl for ${graphOrg?.parent?.name ?? "this family"}`} />;
  }

  function copy(fmt: "md" | "json") {
    const text = fmt === "md" ? formatSuggestionsMarkdown(exportRows) : formatSuggestionsJson(exportRows);
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(fmt);
      window.setTimeout(() => setCopied(null), 1400);
    });
  }

  async function analyse() {
    setBusy(true);
    setNote(null);
    try {
      const res = await runValidation({
        data: { scope: brand === "all" ? "all" : brand, brand, live: false, limit: 16, parentId: parentId || undefined },
      });
      setNote(`Analysed last crawl · ${res.pages} pages · ${res.fail} hits`);
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Analyse failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`min-h-0 flex-1 overflow-auto ${maximized === "explore" ? "fixed inset-0 z-50 bg-bg" : ""}`}>
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <Compass className="size-4 text-muted" />
        <p className="text-xs text-muted">
          Tree suggestions · {rows.length} edges · {selected.length || "all"} in export
        </p>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {(["all", "conflict", "suggests", "sameAs"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={`h-8 rounded-md px-2 text-xs ${kind === k ? "bg-accent text-accent-fg" : "bg-raised text-muted"}`}
            >
              {k}
            </button>
          ))}
          {SORTS.map((c) => (
            <button
              key={c.key}
              type="button"
              className={`h-8 rounded-md px-2 text-xs ${sortKey === c.key ? "bg-accent text-accent-fg" : "bg-raised text-muted"}`}
              onClick={() => setSort(c.key)}
            >
              {c.label}
              {sortKey === c.key ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
            </button>
          ))}
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void analyse()}>
            {busy ? "Analysing…" : "Analyse"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => copy("md")}>
            {copied === "md" ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            Markdown
          </Button>
          <Button size="sm" variant="ghost" onClick={() => copy("json")}>
            {copied === "json" ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            JSON
          </Button>
          <button type="button" className="inline-flex items-center gap-1 text-xs text-fg" onClick={() => setMaximized(maximized === "explore" ? null : "explore")}>
            {maximized === "explore" ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
          </button>
        </div>
      </div>
      {note ? <p className="border-b border-border px-3 py-2 text-xs text-muted">{note}</p> : null}
      <div>
        {rows.map((r) => {
          const rule = RULES.find((x) => x.code === r.code);
          const row = rule
            ? issueRowFromRule(rule, graphOrg)
            : formatIssueListRow({ id: r.code, code: r.code, title: r.title, impact: r.impact, layer: r.layer, org: graphOrg });
          return (
            <IssueRow
              key={`${r.code}:${r.fromId}:${r.toId}`}
              row={row}
              selected={selectedIssueId === r.code}
              onOpen={() => selectIssue(rule?.id ?? r.code)}
              onHover={(on) => hoverIssue(on ? r.code : null)}
              leading={
                <span className="flex items-start gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--color-accent)]"
                    checked={selectedIssueIds.includes(r.code)}
                    onChange={() => toggleIssueSelect(r.code)}
                    aria-label={`Select ${r.code}`}
                  />
                  <Badge tone={r.kind === "conflict" ? "danger" : r.kind === "sameAs" ? "ok" : "warn"}>{r.kind}</Badge>
                </span>
              }
            />
          );
        })}
      </div>
    </div>
  );
}
