import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useStudio } from "@/store/studio";
import { listStudio, upsertTask } from "@/lib/server/studio-db";
import { analyzePage } from "@/lib/server/analyze-page";
import { filterIssues, isHiddenUiCode } from "@/lib/studio/query";
import { formatIssueListRow } from "@/lib/studio/issue-detail";
import { RULES } from "@/data/rules-seed";
import { issueFitsFamily, isSeedFamily, urlInFamily } from "@/lib/org/catalog";
import { EmptyFamilyCrawl } from "@/components/studio/EmptyFamilyCrawl";
import { IssueRow } from "@/components/studio/IssueDrawer";
import { issueCategories, type FindingHit } from "@/lib/studio/rule-pages";

type Finding = FindingHit & { lane?: string; why: string; found?: string; suggested?: string };

export function Backlog() {
  const brand = useStudio((s) => s.brand);
  const product = useStudio((s) => s.product);
  const layer = useStudio((s) => s.layer);
  const impact = useStudio((s) => s.impact);
  const query = useStudio((s) => s.query);
  const selectedIssueId = useStudio((s) => s.selectedIssueId);
  const selectedFindingId = useStudio((s) => s.selectedFindingId);
  const drawerPageUrl = useStudio((s) => s.drawerPageUrl);
  const selectIssue = useStudio((s) => s.selectIssue);
  const selectFinding = useStudio((s) => s.selectFinding);
  const openIssueDrawer = useStudio((s) => s.openIssueDrawer);
  const hoverIssue = useStudio((s) => s.hoverIssue);
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
  const [openCodes, setOpenCodes] = useState<Set<string>>(new Set());

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
    return cats
      .map((c) => ({
        ...c,
        pages: c.pages.filter((p) => `${c.code} ${c.title} ${p.path} ${p.note}`.toLowerCase().includes(q)),
      }))
      .filter((c) => c.pages.length > 0 || `${c.code} ${c.title} ${c.statement}`.toLowerCase().includes(q));
  }, [familyFindings, visibleRules, query]);

  const pageCount = categories.reduce((n, c) => n + c.pages.length, 0);

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

  useEffect(() => {
    if (selectedIssueId) setOpenCodes((prev) => new Set(prev).add(selectedIssueId));
  }, [selectedIssueId]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto p-4">
      <p className="vh-what">
        Categories, not single URLs. Open a rule to see every page with the same failure.
      </p>
      <p className="vh-whisper mt-1">
        {categories.length} categories · {pageCount} pages
      </p>
      {err ? <p className="mt-2 text-sm text-danger">{err}</p> : null}
      {!seedFamily && categories.length === 0 ? (
        <div className="mt-4">
          <EmptyFamilyCrawl title={`No issues for ${graphOrg?.parent?.name ?? "this family"}`} />
        </div>
      ) : null}
      <div className="mt-3 min-h-0 flex-1 overflow-auto rounded-lg bg-surface">
        {categories.map((c) => {
          const expanded = openCodes.has(c.code) || selectedIssueId === c.code;
          return (
            <section key={c.code} className="border-t border-border/80">
              <button
                type="button"
                className="flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-raised/50"
                onClick={() => {
                  setOpenCodes((prev) => {
                    const next = new Set(prev);
                    if (next.has(c.code)) next.delete(c.code);
                    else next.add(c.code);
                    return next;
                  });
                  selectIssue(c.code);
                  hoverIssue(c.code);
                }}
              >
                <span className="font-mono text-xs text-muted">{c.code}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-fg">{c.title}</span>
                  <span className="vh-whisper mt-0.5 block">{c.statement}</span>
                </span>
                <Badge>{c.pages.length} pages</Badge>
              </button>
              {expanded
                ? c.pages.map((p) => {
                    const finding = familyFindings.find((f) => f.code === c.code && f.url === p.url);
                    return (
                      <IssueRow
                        key={`${c.code}:${p.url}`}
                        row={formatIssueListRow({
                          id: finding?.id ?? `${c.code}:${p.url}`,
                          code: c.code,
                          kind: finding ? "html" : "rule",
                          title: p.note || c.title,
                          url: p.url,
                          urls: [p.url],
                          impact: c.impact,
                          layer: c.layer,
                          org: graphOrg,
                        })}
                        selected={
                          (finding ? selectedFindingId === finding.id : false) ||
                          (selectedIssueId === c.code && drawerPageUrl === p.url)
                        }
                        onOpen={() => {
                          if (finding) selectFinding(finding.id);
                          else selectIssue(c.code, p.url);
                        }}
                      />
                    );
                  })
                : null}
            </section>
          );
        })}
        {categories.length === 0 && seedFamily ? (
          <p className="px-3 py-8 text-center text-sm text-muted">No issues match these filters.</p>
        ) : null}
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-xs text-subtle">Add a check</summary>
        <form
          className="mt-2 flex flex-wrap gap-2"
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
                  void reload();
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
