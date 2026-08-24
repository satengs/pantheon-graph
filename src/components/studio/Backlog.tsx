import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useStudio } from "@/store/studio";
import { listStudio } from "@/lib/server/studio-db";
import { analyzePage } from "@/lib/server/analyze-page";
import { filterIssues } from "@/lib/studio/query";
import { LANES, ruleInLane, type BacklogLane } from "@/lib/studio/lanes";
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
  const [lane, setLane] = useState<BacklogLane>("issue");
  const [findings, setFindings] = useState<Finding[]>([]);
  const [endpoint, setEndpoint] = useState("");
  const [url, setUrl] = useState("https://www.freedomdebtrelief.com/debt-relief/");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const filteredRules = useMemo(
    () => filterIssues(RULES, { brand, product, layer, impact, query }).filter((r) => ruleInLane(r, lane)),
    [brand, product, layer, impact, query, lane],
  );

  async function reload() {
    try {
      const data = await listStudio();
      setFindings(data.findings);
      const sys = data.configs.find((c) => c.brand === "fdr");
      if (sys) {
        try {
          const j = JSON.parse(sys.json) as { analyzeEndpoint?: string };
          if (j.analyzeEndpoint) setEndpoint(j.analyzeEndpoint);
        } catch {
          /* ignore */
        }
      }
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load backlog");
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  const q = query.trim().toLowerCase();
  const laneFindings = findings.filter((f) => {
    if (lane === "issue") return f.lane === "issue" || f.code === "H1" || f.code === "SKIP" || f.code === "FAQ" || f.code === "REL" || f.code === "FOOT" || f.code === "MAIN";
    return f.lane === lane;
  }).filter((f) => !q || `${f.title} ${f.why} ${f.url}`.toLowerCase().includes(q));

  const counts = {
    fdr: findings.filter((f) => f.lane === "fdr").length + RULES.filter((r) => ruleInLane(r, "fdr")).length,
    achieve: findings.filter((f) => f.lane === "achieve").length + RULES.filter((r) => ruleInLane(r, "achieve")).length,
    issue: findings.filter((f) => f.lane === "issue").length + RULES.filter((r) => ruleInLane(r, "issue")).length,
    performance: findings.filter((f) => f.lane === "performance").length + RULES.filter((r) => ruleInLane(r, "performance")).length,
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex flex-wrap gap-1.5 border-b border-border px-4 py-2">
        {LANES.map((l) => (
          <button
            key={l.id}
            type="button"
            onClick={() => setLane(l.id)}
            className={`h-9 rounded-md px-3 text-sm ${lane === l.id ? "bg-accent text-accent-fg" : "bg-raised text-muted"}`}
          >
            {l.label} {counts[l.id]}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-2 border-b border-border px-4 py-2">
        <label className="min-w-[200px] flex-1 text-xs text-muted">
          Analyze live URL
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="mt-1 h-9 w-full rounded-md bg-surface px-3 text-sm text-fg shadow-[var(--shadow-border)]"
          />
        </label>
        <Button
          size="sm"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void analyzePage({ data: { url, endpoint: endpoint || undefined } })
              .then((res) => {
                setLane("issue");
                void reload();
                if (res.findings[0]) selectFinding(res.findings[0].id);
                setErr(null);
              })
              .catch((e: unknown) => setErr(e instanceof Error ? e.message : "Analyze failed"))
              .finally(() => setBusy(false));
          }}
        >
          {busy ? "Analyzing…" : "Run outline"}
        </Button>
      </div>
      {err ? <p className="px-4 py-2 text-sm text-danger">{err}</p> : null}
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <p className="mb-3 text-sm text-muted">
          Product work only — FDR, Achieve, semantic HTML issues, and performance. Counts grow when you run outline on a live page.
        </p>
        {laneFindings.length > 0 ? (
          <ul className="mb-4 grid gap-2 md:grid-cols-2">
            {laneFindings.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  onClick={() => selectFinding(f.id)}
                  className={`flex w-full flex-col items-start gap-1 rounded-xl p-3 text-left shadow-[var(--shadow-border)] ${
                    selectedFindingId === f.id ? "bg-raised" : "bg-bg"
                  }`}
                >
                  <span className="font-mono text-[10px] text-subtle">{f.code}</span>
                  <span className="font-medium text-fg">{f.title}</span>
                  <span className="line-clamp-2 text-xs text-muted">{f.why}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <ul className="grid gap-2 md:grid-cols-2">
          {filteredRules.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => {
                  selectFinding(null);
                  selectIssue(r.id);
                }}
                onMouseEnter={() => hoverIssue(r.id)}
                onMouseLeave={() => hoverIssue(null)}
                className="flex w-full flex-col items-start gap-1 rounded-xl bg-bg p-3 text-left shadow-[var(--shadow-border)] hover:bg-raised/70"
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <span className="font-mono text-xs">{r.code}</span>
                  <Badge tone={r.impact === "critical" ? "danger" : "warn"}>{r.impact}</Badge>
                </div>
                <span className="font-medium">{r.title}</span>
                <span className="line-clamp-2 text-xs text-muted">{r.fix}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
