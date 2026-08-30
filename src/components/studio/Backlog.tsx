import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useStudio } from "@/store/studio";
import { listStudio, upsertTask } from "@/lib/server/studio-db";
import { analyzePage } from "@/lib/server/analyze-page";
import { filterIssues, isHiddenUiCode } from "@/lib/studio/query";
import { RULES } from "@/data/rules-seed";
import { issueFitsFamily, isSeedFamily, urlInFamily } from "@/lib/org/catalog";
import { EmptyFamilyCrawl } from "@/components/studio/EmptyFamilyCrawl";
import { issueCategories, type FindingHit } from "@/lib/studio/rule-pages";
import { ValidatePage } from "@/components/studio/ValidatePage";

type Finding = FindingHit & { lane?: string; why: string; found?: string; suggested?: string };

export function Backlog() {
  const brand = useStudio((s) => s.brand);
  const product = useStudio((s) => s.product);
  const layer = useStudio((s) => s.layer);
  const impact = useStudio((s) => s.impact);
  const query = useStudio((s) => s.query);
  const selectedIssueId = useStudio((s) => s.selectedIssueId);
  const selectIssue = useStudio((s) => s.selectIssue);
  const hoverIssue = useStudio((s) => s.hoverIssue);
  const openIssueDrawer = useStudio((s) => s.openIssueDrawer);
  const attachedRuleCodes = useStudio((s) => s.attachedRuleCodes);
  const graphOrg = useStudio((s) => s.graphOrg);
  const parentSlug = useStudio((s) => s.parentSlug);
  const seedFamily = isSeedFamily(graphOrg, parentSlug);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [title, setTitle] = useState("");
  const familyHome = graphOrg?.brands[0]?.url || graphOrg?.parent?.url || "https://www.freedomdebtrelief.com/debt-relief/";
  const [url, setUrl] = useState(familyHome);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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
    const cats = issueCategories(familyFindings, visibleRules);
    const q = query.trim().toLowerCase();
    if (!q) return cats;
    return cats.filter((c) => `${c.code} ${c.title} ${c.statement}`.toLowerCase().includes(q) || c.pages.some((p) => p.path.toLowerCase().includes(q)));
  }, [familyFindings, visibleRules, query]);

  useEffect(() => {
    void listStudio()
      .then((d) => {
        setFindings(d.findings);
        setErr(null);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : "Could not load issues"));
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto p-3">
      {err ? <p className="mb-2 text-sm text-danger">{err}</p> : null}
      <ValidatePage />
      {!seedFamily && categories.length === 0 ? (
        <EmptyFamilyCrawl title={`No issues for ${graphOrg?.parent?.name ?? "this family"}`} />
      ) : null}
      <div className="min-h-0 flex-1 overflow-auto rounded-lg bg-surface">
        {categories.map((c) => {
          const on = selectedIssueId === c.code;
          return (
            <button
              key={c.code}
              type="button"
              className={`flex w-full items-center gap-3 border-t border-border/80 px-3 py-2.5 text-left hover:bg-raised/50 ${
                on ? "bg-raised" : ""
              }`}
              onClick={() => {
                selectIssue(c.code);
                hoverIssue(c.code);
              }}
            >
              <span className="w-8 shrink-0 font-mono text-xs text-subtle">{c.code}</span>
              <span className="min-w-0 flex-1 truncate text-sm text-fg">{c.title}</span>
              <span className="shrink-0 font-mono text-xs tabular-nums text-muted">{c.pages.length}</span>
            </button>
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
        <div className="mt-2 flex flex-wrap items-end gap-2">
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
                  if (res.findings[0]) openIssueDrawer({ findingId: res.findings[0].id });
                })
                .catch((e: unknown) => setErr(e instanceof Error ? e.message : "Analyze failed"))
                .finally(() => setBusy(false));
            }}
          >
            {busy ? "Checking…" : "Check URL"}
          </Button>
        </div>
      </details>
    </div>
  );
}
