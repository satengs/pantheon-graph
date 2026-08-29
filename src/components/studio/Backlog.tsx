import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useStudio } from "@/store/studio";
import { listStudio, upsertTask } from "@/lib/server/studio-db";
import { analyzePage } from "@/lib/server/analyze-page";
import { cmp, filterIssues, isHiddenUiCode } from "@/lib/studio/query";
import { formatIssueListRow, type IssueListRow } from "@/lib/studio/issue-detail";
import { RULES } from "@/data/rules-seed";
import { issueFitsFamily, isSeedFamily, urlInFamily } from "@/lib/org/catalog";
import { EmptyFamilyCrawl } from "@/components/studio/EmptyFamilyCrawl";
import { IssueRow, issueRowFromRule } from "@/components/studio/IssueDrawer";

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

type Point = {
  id: string;
  kind: "rule" | "html";
  row: IssueListRow;
};

const SORTS: { key: string; label: string }[] = [
  { key: "pagePath", label: "Page" },
  { key: "section", label: "Section" },
  { key: "what", label: "What" },
  { key: "impact", label: "Impact" },
  { key: "code", label: "ID" },
];

export function Backlog() {
  const brand = useStudio((s) => s.brand);
  const product = useStudio((s) => s.product);
  const layer = useStudio((s) => s.layer);
  const impact = useStudio((s) => s.impact);
  const query = useStudio((s) => s.query);
  const selectedIssueId = useStudio((s) => s.selectedIssueId);
  const selectedFindingId = useStudio((s) => s.selectedFindingId);
  const openIssueDrawer = useStudio((s) => s.openIssueDrawer);
  const hoverIssue = useStudio((s) => s.hoverIssue);
  const attachedRuleCodes = useStudio((s) => s.attachedRuleCodes);
  const graphOrg = useStudio((s) => s.graphOrg);
  const parentSlug = useStudio((s) => s.parentSlug);
  const seedFamily = isSeedFamily(graphOrg, parentSlug);
  const sortKey = useStudio((s) => s.sortKey);
  const sortDir = useStudio((s) => s.sortDir);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [title, setTitle] = useState("");
  const familyHome = graphOrg?.brands[0]?.url || graphOrg?.parent?.url || "https://www.freedomdebtrelief.com/debt-relief/";
  const [url, setUrl] = useState(familyHome);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const points = useMemo(() => {
    const rules: Point[] = seedFamily
      ? filterIssues(RULES, { brand, product, layer, impact, query, codes: attachedRuleCodes })
          .filter((r) => issueFitsFamily(r, graphOrg, parentSlug))
          .map((r) => ({ id: r.id, kind: "rule" as const, row: issueRowFromRule(r, graphOrg) }))
      : [];
    const q = query.trim().toLowerCase();
    const html: Point[] = findings
      .filter((f) => !isHiddenUiCode(f.code))
      .filter((f) => (seedFamily ? true : urlInFamily(f.url, graphOrg)))
      .filter((f) => !q || `${f.title} ${f.why} ${f.url} ${f.code}`.toLowerCase().includes(q))
      .map((f) => ({
        id: f.id,
        kind: "html" as const,
        row: formatIssueListRow({
          id: f.id,
          code: f.code,
          kind: "html",
          title: f.title,
          url: f.url,
          impact: "high",
          layer: "L1",
          org: graphOrg,
        }),
      }));
    const all = [...html, ...rules];
    const IMPACT: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    return all.sort((a, b) => {
      if (sortKey === "impact") return cmp(IMPACT[a.row.impact] ?? 9, IMPACT[b.row.impact] ?? 9, sortDir);
      const key = SORTS.some((s) => s.key === sortKey) ? sortKey : "impact";
      const av = String((a.row as unknown as Record<string, string>)[key] ?? a.row.pagePath);
      const bv = String((b.row as unknown as Record<string, string>)[key] ?? b.row.pagePath);
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

  function openPoint(p: Point) {
    if (p.kind === "html") openIssueDrawer({ findingId: p.id, pageUrl: p.row.pageUrl });
    else openIssueDrawer({ issueId: p.id, pageUrl: p.row.pageUrl });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto p-4">
      <p className="text-sm text-muted">
        Each row is the problem. Under it is the page and the section.
      </p>
      {err ? <p className="mt-2 text-sm text-danger">{err}</p> : null}
      {!seedFamily && points.length === 0 ? (
        <div className="mt-4">
          <EmptyFamilyCrawl title={`No issues for ${graphOrg?.parent?.name ?? "this family"}`} />
        </div>
      ) : null}
      <div className="mt-3 min-h-0 flex-1 overflow-auto rounded-lg bg-surface">
        {points.map((p) => (
          <IssueRow
            key={p.id}
            row={p.row}
            selected={p.kind === "html" ? selectedFindingId === p.id : selectedIssueId === p.id}
            onOpen={() => openPoint(p)}
            onHover={(on) => p.kind === "rule" && hoverIssue(on ? p.id : null)}
          />
        ))}
        {points.length === 0 && seedFamily ? (
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
            {busy ? "Reading…" : "Run outline"}
          </Button>
        </div>
      </details>
    </div>
  );
}
