import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useStudio } from "@/store/studio";
import { RULES, RULE_TITLE } from "@/data/rules-seed";
import { isOpenIssue } from "@/lib/studio/query";
import { validatePage, type RuleVerdict } from "@/lib/server/validate-page";

export function ValidatePage() {
  const attachedRuleCodes = useStudio((s) => s.attachedRuleCodes);
  const graphOrg = useStudio((s) => s.graphOrg);
  const familyHome = graphOrg?.brands[0]?.url || graphOrg?.parent?.url || "";
  const pool = useMemo(() => {
    const attached = attachedRuleCodes.length ? attachedRuleCodes : RULES.map((r) => r.code);
    return RULES.filter((r) => attached.includes(r.code) && (isOpenIssue(r.status) || r.status === "pass" || r.status === "studio"));
  }, [attachedRuleCodes]);

  const [url, setUrl] = useState(familyHome);
  const [picked, setPicked] = useState<string[]>([]);
  const [customOn, setCustomOn] = useState(false);
  const [customTitle, setCustomTitle] = useState("");
  const [customStatement, setCustomStatement] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [agent, setAgent] = useState<string | null>(null);
  const [results, setResults] = useState<RuleVerdict[] | null>(null);

  useEffect(() => {
    setPicked((prev) => (prev.length ? prev : pool.slice(0, 8).map((r) => r.code)));
  }, [pool]);

  function toggle(code: string) {
    setPicked((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  }

  return (
    <section className="mb-3 rounded-lg bg-surface p-3 shadow-[var(--shadow-border)]">
      <p className="text-sm text-fg">Validate a page</p>
      <p className="vh-whisper mt-1">
        Fetch HTML, run schema/title engines, then Grok (xAI grok-4) for copy/entity and custom rules. One model call —
        not a crew of agents.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://…"
          className="h-9 min-w-[220px] flex-1 rounded-md bg-bg px-3 text-sm shadow-[var(--shadow-border)]"
        />
        <Button
          size="sm"
          disabled={busy || !url.trim()}
          onClick={() => {
            setBusy(true);
            setErr(null);
            void validatePage({
              data: {
                url: url.trim(),
                codes: picked,
                custom: customOn && customStatement.trim().length >= 8
                  ? { title: customTitle.trim() || "Custom", statement: customStatement.trim() }
                  : undefined,
              },
            })
              .then((res) => {
                setResults(res.results);
                setAgent(res.agent === "grok-4" ? "Grok (grok-4)" : res.agent === "local" ? "Local engines (Grok off)" : "Local engines");
              })
              .catch((e: unknown) => setErr(e instanceof Error ? e.message : "Validate failed"))
              .finally(() => setBusy(false));
          }}
        >
          {busy ? "Validating…" : "Validate"}
        </Button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        <button
          type="button"
          className="h-7 rounded-md px-2 text-[11px] text-muted hover:text-fg"
          onClick={() => setPicked(pool.map((r) => r.code))}
        >
          All
        </button>
        <button type="button" className="h-7 rounded-md px-2 text-[11px] text-muted hover:text-fg" onClick={() => setPicked([])}>
          None
        </button>
        {pool.map((r) => {
          const on = picked.includes(r.code);
          return (
            <button
              key={r.code}
              type="button"
              onClick={() => toggle(r.code)}
              className={`h-7 rounded-md px-2 font-mono text-[11px] ${on ? "bg-accent text-accent-fg" : "bg-raised text-muted"}`}
            >
              {r.code}
            </button>
          );
        })}
      </div>
      <label className="mt-2 flex items-center gap-2 text-xs text-muted">
        <input type="checkbox" checked={customOn} onChange={(e) => setCustomOn(e.target.checked)} />
        Custom rule
      </label>
      {customOn ? (
        <div className="mt-2 grid gap-2">
          <input
            value={customTitle}
            onChange={(e) => setCustomTitle(e.target.value)}
            placeholder="Name"
            className="h-9 rounded-md bg-bg px-3 text-sm shadow-[var(--shadow-border)]"
          />
          <textarea
            value={customStatement}
            onChange={(e) => setCustomStatement(e.target.value)}
            placeholder="This page must…"
            className="min-h-16 rounded-md bg-bg px-3 py-2 text-sm shadow-[var(--shadow-border)]"
          />
        </div>
      ) : null}
      {err ? <p className="mt-2 text-sm text-danger">{err}</p> : null}
      {agent ? <p className="vh-whisper mt-2">Ran: {agent}</p> : null}
      {results ? (
        <ul className="mt-2 space-y-1.5">
          {results.map((r) => (
            <li key={r.code} className="flex items-start gap-2 rounded-md bg-bg px-2 py-1.5">
              <Badge tone={r.status === "pass" ? "ok" : "danger"}>{r.status}</Badge>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-fg">
                  <span className="font-mono text-xs text-subtle">{r.code}</span> {RULE_TITLE[r.code] ?? r.title}
                </p>
                <p className="text-xs text-muted text-pretty">{r.why}</p>
                {r.quote ? <p className="mt-0.5 font-mono text-[11px] text-subtle">“{r.quote}”</p> : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
