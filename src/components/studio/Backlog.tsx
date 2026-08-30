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
import { TREE_SUGGESTIONS, formatSuggestionsJson, formatSuggestionsMarkdown, suggestionRows } from "@/lib/graph/suggestions";
import type { GraphEdge } from "@/lib/graph/types";
import { CATEGORIES, IDEAL_TREE, recCategoryForCode, type RecCategory } from "@/data/recommend";

type Finding = FindingHit & { lane?: string; why: string; found?: string; suggested?: string };
type KindFilter = "all" | GraphEdge["kind"];

const KIND: Record<string, GraphEdge["kind"]> = Object.fromEntries(TREE_SUGGESTIONS.map((t) => [t.code, t.kind]));

function exportMarkdown(cats: IssueCategory[]): string {
  return cats
    .map((c) => `### ${c.code} ${c.title}\n${KIND[c.code] ?? "check"} · ${c.pages.length} pages\n${c.statement}\n`)
    .join("\n");
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
  const selectedIssueIds = useStudio((s) => s.selectedIssueIds);
  const toggleIssueSelect = useStudio((s) => s.toggleIssueSelect);
  const attachedRuleCodes = useStudio((s) => s.attachedRuleCodes);
  const graphOrg = useStudio((s) => s.graphOrg);
  const parentSlug = useStudio((s) => s.parentSlug);
  const parentId = useStudio((s) => s.parentId);
  const seedFamily = isSeedFamily(graphOrg, parentSlug);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [title, setTitle] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [kind, setKind] = useState<KindFilter>("all");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [copied, setCopied] = useState<"md" | "json" | null>(null);
  const [sortKey, setSortKey] = useState<"code" | "pages" | "kind">("pages");
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
    return filtered.slice().sort((a, b) => {
      if (sortKey === "pages") return b.pages.length - a.pages.length;
      if (sortKey === "kind") return (KIND[a.code] ?? "").localeCompare(KIND[b.code] ?? "");
      return a.code.localeCompare(b.code);
    });
  }, [familyFindings, visibleRules, query, kind, sortKey, roadmap]);

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
  }, [note]);

  const selectedCats = categories.filter((c) => selectedIssueIds.includes(c.code));
  const exportCats = selectedCats.length ? selectedCats : categories;

  function copy(fmt: "md" | "json") {
    let text: string;
    if (seedFamily) {
      const codes = new Set(exportCats.map((c) => c.code));
      const rows = suggestionRows().filter((r) => codes.has(r.code));
      text = fmt === "md" ? formatSuggestionsMarkdown(rows) : formatSuggestionsJson(rows);
    } else {
      text = fmt === "md" ? exportMarkdown(exportCats) : JSON.stringify(exportCats, null, 2);
    }
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(fmt);
      window.setTimeout(() => setCopied(null), 1400);
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto p-3">
      {err ? <p className="mb-2 text-sm text-danger">{err}</p> : null}
      <ValidatePage />
      {seedFamily ? (
        <details className="mb-2 rounded-lg bg-surface p-3">
          <summary className="cursor-pointer text-sm text-fg">Ideal graph · SERP / AI payoff</summary>
          <p className="vh-whisper mt-1">Parent named once. Brands do not sell each other’s products.</p>
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
      ) : null}
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
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
        {seedFamily
          ? (["all", "identity", "ownership", "wrong-shelf", "same-page", "ai-recipe"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setRoadmap(k)}
                className={`h-8 rounded-md px-2 text-xs ${roadmap === k ? "bg-accent text-accent-fg" : "bg-raised text-muted"}`}
              >
                {k === "all" ? "roadmap" : CATEGORIES[k].label}
              </button>
            ))
          : null}
        {(["pages", "code", "kind"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setSortKey(k)}
            className={`h-8 rounded-md px-2 text-xs ${sortKey === k ? "bg-accent text-accent-fg" : "bg-raised text-muted"}`}
          >
            {k}
          </button>
        ))}
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
        <span className="vh-whisper ml-auto">
          {categories.length} · {selectedCats.length || "all"} export
        </span>
      </div>
      {note ? <p className="mb-2 text-xs text-muted">{note}</p> : null}
      {!seedFamily && categories.length === 0 ? (
        <EmptyFamilyCrawl title={`No issues for ${graphOrg?.parent?.name ?? "this family"}`} />
      ) : null}
      <div className="min-h-0 flex-1 overflow-auto rounded-lg bg-surface">
        {categories.map((c) => {
          const on = selectedIssueId === c.code;
          const edge = KIND[c.code];
          return (
            <div
              key={c.code}
              className={`flex w-full items-center gap-2 border-t border-border/80 px-3 py-2 ${on ? "bg-raised" : ""}`}
            >
              <input
                type="checkbox"
                className="size-4 shrink-0 accent-[var(--color-accent)]"
                checked={selectedIssueIds.includes(c.code)}
                onChange={() => toggleIssueSelect(c.code)}
                aria-label={`Select ${c.code}`}
              />
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-3 text-left hover:text-fg"
                onClick={() => {
                  selectIssue(c.code);
                  hoverIssue(c.code);
                }}
              >
                <span className="w-8 shrink-0 font-mono text-xs text-subtle">{c.code}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-fg">{c.title}</span>
                {edge ? (
                  <Badge tone={edge === "conflict" ? "danger" : edge === "sameAs" ? "ok" : "warn"}>{edge}</Badge>
                ) : null}
                <span className="shrink-0 font-mono text-xs tabular-nums text-muted">{c.pages.length}</span>
              </button>
            </div>
          );
        })}
        {categories.length === 0 && seedFamily ? (
          <p className="px-3 py-8 text-center text-sm text-muted">No issues match these filters.</p>
        ) : null}
      </div>
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-xs text-subtle">Add a check</summary>
        <form
          className="mt-2 flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!title.trim()) return;
            void upsertTask({ data: { title: title.trim() } }).then(() => setTitle(""));
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
      </details>
    </div>
  );
}
