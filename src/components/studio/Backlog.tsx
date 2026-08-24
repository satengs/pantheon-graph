import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useStudio } from "@/store/studio";
import { listStudio, upsertTask } from "@/lib/server/studio-db";
import { analyzePage } from "@/lib/server/analyze-page";
import { filterIssues } from "@/lib/studio/query";
import { ISSUE_ALIAS } from "@/lib/graph/aliases";
import { RULES } from "@/data/rules-seed";

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
  const sortKey = useStudio((s) => s.sortKey);
  const sortDir = useStudio((s) => s.sortDir);
  const setSort = useStudio((s) => s.setSort);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("https://www.freedomdebtrelief.com/debt-relief/");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const points = useMemo(() => {
    const rules = filterIssues(RULES, { brand, product, layer, impact, query }).map((r) => ({
      id: r.id,
      code: r.code,
      title: r.title,
      alias: ISSUE_ALIAS[r.code] ?? r.code,
      kind: "rule" as const,
      why: r.reason,
      impact: r.impact,
    }));
    const q = query.trim().toLowerCase();
    const html = findings
      .filter((f) => !q || `${f.title} ${f.why} ${f.url}`.toLowerCase().includes(q))
      .map((f) => ({
        id: f.id,
        code: f.code,
        title: f.title,
        alias: f.code,
        kind: "html" as const,
        why: f.why,
        impact: "high" as const,
      }));
    const all = [...html, ...rules];
    return all.sort((a, b) => {
      const av = String((a as Record<string, string>)[sortKey] ?? a.code);
      const bv = String((b as Record<string, string>)[sortKey] ?? b.code);
      return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    });
  }, [brand, product, layer, impact, query, findings, sortKey, sortDir]);

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
        Validation points for the websites — HTML outline mistakes and content rules. Click one to view the issue.
      </p>
      {err ? <p className="mt-2 text-sm text-danger">{err}</p> : null}
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
      <div className="mt-3 flex gap-2 text-xs text-muted">
        <button type="button" onClick={() => setSort("code")}>
          Sort id {sortKey === "code" ? (sortDir === "asc" ? "↑" : "↓") : ""}
        </button>
        <button type="button" onClick={() => setSort("title")}>
          Sort name {sortKey === "title" ? (sortDir === "asc" ? "↑" : "↓") : ""}
        </button>
        <button type="button" onClick={() => setSort("alias")}>
          Sort alias {sortKey === "alias" ? (sortDir === "asc" ? "↑" : "↓") : ""}
        </button>
      </div>
      <ul className="mt-3 grid gap-2 md:grid-cols-2">
        {points.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => {
                if (p.kind === "html") selectFinding(p.id);
                else {
                  selectFinding(null);
                  selectIssue(p.id);
                }
              }}
              onMouseEnter={() => p.kind === "rule" && hoverIssue(p.id)}
              onMouseLeave={() => hoverIssue(null)}
              className={`flex w-full flex-col items-start gap-1 rounded-xl p-3 text-left shadow-[var(--shadow-border)] ${
                selectedFindingId === p.id ? "bg-raised" : "bg-bg hover:bg-raised/70"
              }`}
            >
              <div className="flex w-full items-center justify-between gap-2">
                <span className="font-mono text-xs text-subtle">
                  {p.code} · {p.alias}
                </span>
                <Badge tone={p.impact === "critical" ? "danger" : "warn"}>{p.kind === "html" ? "HTML" : "rule"}</Badge>
              </div>
              <span className="font-medium text-fg">{p.title}</span>
              <span className="line-clamp-2 text-xs text-muted">{p.why}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
