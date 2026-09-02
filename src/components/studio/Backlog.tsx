import { useEffect, useMemo, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useStudio } from "@/store/studio";
import { listStudio, upsertTask } from "@/lib/server/studio-db";
import { runValidation } from "@/lib/server/validate-run";
import { filterIssues, isHiddenUiCode } from "@/lib/studio/query";
import { RULES } from "@/data/rules-seed";
import { issueFitsFamily, isSeedFamily, urlInFamily } from "@/lib/org/catalog";
import { EmptyFamilyCrawl } from "@/components/studio/EmptyFamilyCrawl";
import { issueCategories, type FindingHit, type IssueCategory } from "@/lib/studio/rule-pages";
import { ValidatePage } from "@/components/studio/ValidatePage";
import { VirtualList } from "@/components/studio/VirtualList";
import { TREE_SUGGESTIONS, formatSuggestionsJson, formatSuggestionsMarkdown, suggestionRows } from "@/lib/graph/suggestions";
import type { GraphEdge } from "@/lib/graph/types";
import { CATEGORIES, IDEAL_TREE, recCategoryForCode, type RecCategory } from "@/data/recommend";

type Finding = FindingHit & { lane?: string; why: string; found?: string; suggested?: string };
type KindFilter = "all" | GraphEdge["kind"];
type SortKey = "code" | "title" | "kind" | "pages" | "impact";

const KIND: Record<string, GraphEdge["kind"]> = Object.fromEntries(TREE_SUGGESTIONS.map((t) => [t.code, t.kind]));

function exportMarkdown(cats: IssueCategory[]): string {
  return cats
    .map((c) => `### ${c.code} ${c.title}\n${KIND[c.code] ?? "check"} · ${c.pages.length} pages\n${c.statement}\n`)
    .join("\n");
}

function RadioRow({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { id: string; label: string }[];
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1" role="radiogroup" aria-label={label}>
      <span className="vh-kicker w-14 shrink-0">{label}</span>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={`h-8 rounded-md px-2 text-xs ${value === o.id ? "bg-accent text-accent-fg" : "bg-raised text-muted"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Backlog() {
  const brand = useStudio((s) => s.brand);
  const product = useStudio((s) => s.product);
  const layer = useStudio((s) => s.layer);
  const impact = useStudio((s) => s.impact);
  const query = useStudio((s) => s.query);
  const selectedIssueId = useStudio((s) => s.selectedIssueId);
  const selectIssue = useStudio((s) => s.selectIssue);
  const hoverIssue = useStudio((s) => s.hoverIssue);
  const attachedRuleCodes = useStudio((s) => s.attachedRuleCodes);
  const graphOrg = useStudio((s) => s.graphOrg);
  const parentSlug = useStudio((s) => s.parentSlug);
  const parentId = useStudio((s) => s.parentId);
  const seedFamily = isSeedFamily(graphOrg, parentSlug);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [taskTitle, setTaskTitle] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [kind, setKind] = useState<KindFilter>("all");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [copied, setCopied] = useState<"md" | "json" | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("pages");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [roadmap, setRoadmap] = useState<"all" | RecCategory>("all");

  const visibleRules = useMemo(
    () =>
      filterIssues(RULES, { brand, product, layer, impact, query, codes: attachedRuleCodes }).filter((r) =>
        issueFitsFamily(r, graphOrg, parentSlug),
      ),
    [brand, product, layer, impact, query, attachedRuleCodes, graphOrg, parentSlug],
  );

  const familyFindings = useMemo(
    () =>
      findings
        .filter((f) => !isHiddenUiCode(f.code))
        .filter((f) => (seedFamily ? true : urlInFamily(f.url, graphOrg))),
    [findings, seedFamily, graphOrg],
  );

  const categories = useMemo(() => {
    const cats = issueCategories(familyFindings, visibleRules).filter((c) => {
      if (kind !== "all" && KIND[c.code] !== kind) return false;
      if (roadmap !== "all" && recCategoryForCode(c.code) !== roadmap) return false;
      return true;
    });
    const q = query.trim().toLowerCase();
    const filtered = q
      ? cats.filter(
          (c) =>
            `${c.code} ${c.title} ${c.statement} ${KIND[c.code] ?? ""}`.toLowerCase().includes(q) ||
            c.pages.some((p) => p.path.toLowerCase().includes(q)),
        )
      : cats;
    const dir = sortDir === "asc" ? 1 : -1;
    return filtered.slice().sort((a, b) => {
      const av =
        sortKey === "pages"
          ? a.pages.length
          : sortKey === "kind"
            ? KIND[a.code] ?? ""
            : sortKey === "impact"
              ? a.impact
              : sortKey === "title"
                ? a.title
                : a.code;
      const bv =
        sortKey === "pages"
          ? b.pages.length
          : sortKey === "kind"
            ? KIND[b.code] ?? ""
            : sortKey === "impact"
              ? b.impact
              : sortKey === "title"
                ? b.title
                : b.code;
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }, [familyFindings, visibleRules, query, kind, sortKey, sortDir, roadmap]);

  useEffect(() => {
    void listStudio()
      .then((d) => {
        setFindings(d.findings);
        setErr(null);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : "Could not load issues"));
  }, [note]);

  function clickSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "pages" || key === "impact" ? "desc" : "asc");
    }
  }

  function copy(fmt: "md" | "json") {
    let text: string;
    if (seedFamily) {
      const codes = new Set(categories.map((c) => c.code));
      const rows = suggestionRows().filter((r) => codes.has(r.code));
      text = fmt === "md" ? formatSuggestionsMarkdown(rows) : formatSuggestionsJson(rows);
    } else {
      text = fmt === "md" ? exportMarkdown(categories) : JSON.stringify(categories, null, 2);
    }
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(fmt);
      window.setTimeout(() => setCopied(null), 1400);
    });
  }

  const cols: { key: SortKey; label: string; width?: string }[] = [
    { key: "code", label: "Code", width: "w-14" },
    { key: "title", label: "Title" },
    { key: "kind", label: "Kind", width: "w-24" },
    { key: "impact", label: "Impact", width: "w-20" },
    { key: "pages", label: "Pages", width: "w-16" },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto p-3">
      {err ? <p className="mb-2 text-sm text-danger">{err}</p> : null}
      <ValidatePage />
      {seedFamily ? (
        <section className="mb-3 rounded-lg bg-surface p-3">
          <h2 className="text-sm text-fg">Ideal graph</h2>
          <p className="vh-whisper mt-1">Parent named once. Brands do not sell each other’s products.</p>
          <details className="mt-2">
            <summary className="cursor-pointer text-xs text-muted">Show target split</summary>
            <div className="mt-3 flex flex-col items-center">
              <div className="rounded-lg bg-raised px-3 py-1.5 text-xs">{IDEAL_TREE.parent}</div>
              <div className="h-4 w-px bg-border" />
              <div className="flex w-full gap-2">
                {IDEAL_TREE.brands.map((b) => (
                  <div key={b.id} className="min-w-0 flex-1 rounded-md bg-raised p-2">
                    <p className={`text-sm ${b.id === "fdr" ? "text-fdr" : "text-achieve"}`}>{b.name}</p>
                    <p className="text-[11px] text-muted">{b.role}</p>
                    <p className="mt-1 text-[11px] text-fg">{b.products.join(" · ")}</p>
                  </div>
                ))}
              </div>
            </div>
          </details>
        </section>
      ) : null}

      <section className="mb-2 space-y-1.5">
        <h2 className="text-sm text-fg">Filters</h2>
        <RadioRow
          label="Kind"
          value={kind}
          onChange={(id) => setKind(id as KindFilter)}
          options={[
            { id: "all", label: "All kinds" },
            { id: "conflict", label: "Conflict" },
            { id: "suggests", label: "Suggests" },
            { id: "sameAs", label: "sameAs" },
          ]}
        />
        {seedFamily ? (
          <RadioRow
            label="Roadmap"
            value={roadmap}
            onChange={(id) => setRoadmap(id as "all" | RecCategory)}
            options={[
              { id: "all", label: "All groups" },
              ...(["identity", "ownership", "wrong-shelf", "same-page", "ai-recipe"] as const).map((id) => ({
                id,
                label: CATEGORIES[id].label,
              })),
            ]}
          />
        ) : null}
      </section>

      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void runValidation({
              data: { scope: brand === "all" ? "all" : brand, brand, live: false, limit: 16, parentId: parentId || undefined },
            })
              .then((res) => setNote(`Analysed ${res.pages} pages · ${res.fail} hits`))
              .catch((e: unknown) => setNote(e instanceof Error ? e.message : "Analyse failed"))
              .finally(() => setBusy(false));
          }}
        >
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
        <span className="vh-whisper ml-auto">{categories.length} in view</span>
      </div>
      {note ? <p className="mb-2 text-xs text-muted">{note}</p> : null}
      {!seedFamily && categories.length === 0 ? (
        <EmptyFamilyCrawl title={`No issues for ${graphOrg?.parent?.name ?? "this family"}`} />
      ) : null}

      <section className="flex min-h-0 flex-1 flex-col rounded-lg bg-surface">
        <h2 className="px-3 pt-3 text-sm text-fg">Issues</h2>
        <p className="vh-whisper px-3 pb-2">One selected. Click a column to sort.</p>
        <div className="flex items-center gap-3 border-b border-border px-3 py-1.5">
          {cols.map((col) => (
            <button
              key={col.key}
              type="button"
              onClick={() => clickSort(col.key)}
              className={`text-left text-[10px] uppercase tracking-wide ${col.width ?? "min-w-0 flex-1"} ${
                sortKey === col.key ? "text-fg" : "text-subtle"
              }`}
            >
              {col.label}
              {sortKey === col.key ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
            </button>
          ))}
        </div>
        <VirtualList
          className="min-h-0 flex-1 overflow-auto"
          items={categories}
          rowHeight={48}
          getKey={(c) => c.code}
          selectedIndex={categories.findIndex((c) => c.code === selectedIssueId)}
          renderRow={(c) => {
            const on = selectedIssueId === c.code;
            const edge = KIND[c.code];
            return (
              <button
                type="button"
                role="radio"
                aria-checked={on}
                className={`flex h-12 w-full items-center gap-3 border-t border-border/80 px-3 text-left ${
                  on
                    ? "bg-[color-mix(in_oklab,var(--color-accent)_14%,var(--color-surface))] shadow-[inset_3px_0_0_var(--color-accent)]"
                    : "hover:bg-raised/40"
                }`}
                onClick={() => {
                  selectIssue(c.code);
                  hoverIssue(c.code);
                }}
              >
                <span className="w-14 shrink-0 font-mono text-xs text-subtle">{c.code}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-fg">{c.title}</span>
                <span className="w-24 shrink-0">
                  {edge ? (
                    <Badge tone={edge === "conflict" ? "danger" : edge === "sameAs" ? "ok" : "warn"}>{edge}</Badge>
                  ) : (
                    <span className="text-xs text-subtle">—</span>
                  )}
                </span>
                <span className="w-20 shrink-0 text-xs text-muted">{c.impact}</span>
                <span className="w-16 shrink-0 font-mono text-xs tabular-nums text-muted">{c.pages.length}</span>
              </button>
            );
          }}
        />
        {categories.length === 0 && seedFamily ? (
          <p className="px-3 py-8 text-center text-sm text-muted">No issues match these filters.</p>
        ) : null}
      </section>

      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-xs text-subtle">Add a check</summary>
        <form
          className="mt-2 flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!taskTitle.trim()) return;
            void upsertTask({ data: { title: taskTitle.trim() } }).then(() => setTaskTitle(""));
          }}
        >
          <input
            value={taskTitle}
            onChange={(e) => setTaskTitle(e.target.value)}
            placeholder="Add a validation point"
            className="h-9 min-w-[200px] flex-1 rounded-md bg-surface px-3 text-sm shadow-[var(--shadow-border)]"
          />
          <Button type="submit" size="sm">
            Add
          </Button>
        </form>
      </details>
    </div>
  );
}
