import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { runValidation, validateLiveUrl, type RuleScope } from "@/lib/server/validate-run";
import { useStudio } from "@/store/studio";
import { isSeedFamily } from "@/lib/org/catalog";

const SCOPES: { id: RuleScope; label: string; hint: string }[] = [
  { id: "all", label: "All rules", hint: "Common plus both brands" },
  { id: "common", label: "Common", hint: "Rules that apply to every brand" },
  { id: "fdr", label: "FDR + common", hint: "Freedom Debt Relief and shared checks" },
  { id: "achieve", label: "Achieve + common", hint: "Achieve and shared checks" },
];

type Row = { url: string; fail: number; source: string };

export function ValidatePanel() {
  const brand = useStudio((s) => s.brand);
  const product = useStudio((s) => s.product);
  const selectFinding = useStudio((s) => s.selectFinding);
  const setTab = useStudio((s) => s.setTab);
  const graphOrg = useStudio((s) => s.graphOrg);
  const parentId = useStudio((s) => s.parentId);
  const parentSlug = useStudio((s) => s.parentSlug);
  const seedFamily = isSeedFamily(graphOrg, parentSlug);
  const scopes = useMemo(
    () =>
      seedFamily
        ? SCOPES
        : [
            { id: "system", label: "System defaults", hint: "Schema, canonical, JSON-LD, article semantics" },
            { id: "all", label: "Attached rules", hint: "Whatever this family has attached" },
          ],
    [seedFamily],
  );
  const home = graphOrg?.brands[0]?.url || graphOrg?.parent?.url || "https://www.freedomdebtrelief.com/debt-relief/";
  const [scope, setScope] = useState<RuleScope>(seedFamily ? (brand === "all" ? "all" : brand) : "system");
  const [url, setUrl] = useState(home);
  const [busy, setBusy] = useState<"crawl" | "live" | "url" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [liveNodes, setLiveNodes] = useState<Array<{ id: string; types: string[]; name: string }>>([]);

  useEffect(() => {
    setScope(seedFamily ? (brand === "all" ? "all" : brand) : "system");
    setUrl(home);
  }, [seedFamily, parentId, home, brand]);

  async function onCrawled(live: boolean) {
    setBusy(live ? "live" : "crawl");
    setErr(null);
    try {
      const res = await runValidation({
        data: { scope, brand, product, live, limit: 12, parentId: parentId || undefined },
      });
      setRows(res.perUrl);
      setSummary(
        `${res.pages} pages · ${res.fail} issues · ${res.usedSnap} from saved copies${res.usedLive ? ` · ${res.usedLive} fetched live` : ""}`,
      );
      if (res.findings[0]) selectFinding(res.findings[0].id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Check failed");
    } finally {
      setBusy(null);
    }
  }

  async function onUrl(live: boolean) {
    setBusy("url");
    setErr(null);
    try {
      const res = await validateLiveUrl({ data: { url, scope, live } });
      setLiveNodes(res.jsonld);
      setRows([{ url: res.url, fail: res.fail, source: res.source }]);
      setSummary(
        res.fail
          ? `${res.fail} issues on this URL · ${res.source}`
          : `Pass · JSON-LD matches the ${scope} rule set · ${res.source}`,
      );
      if (res.findings[0]) {
        selectFinding(res.findings[0].id);
        setTab("issues");
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not read that URL");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="border-b border-border bg-surface/60 px-4 py-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[220px] flex-1">
          <p className="text-[10px] uppercase tracking-wide text-subtle">Rule set</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {scopes.map((s) => (
              <button
                key={s.id}
                type="button"
                title={s.hint}
                onClick={() => setScope(s.id)}
                className={`h-8 rounded-md px-2.5 text-xs ${
                  scope === s.id ? "bg-accent text-accent-fg" : "bg-bg text-muted shadow-[var(--shadow-border)]"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <Button size="sm" disabled={!!busy} onClick={() => void onCrawled(false)}>
          {busy === "crawl" ? "Checking…" : "Run on crawled pages"}
        </Button>
        <Button variant="secondary" size="sm" disabled={!!busy} onClick={() => void onCrawled(true)}>
          {busy === "live" ? "Fetching…" : "Re-fetch those pages"}
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted">
        Changing a rule does not need a new crawl. Run checks against the pages you already have. Re-fetch only when the live HTML changed.
      </p>
      <form
        className="mt-3 flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void onUrl(true);
        }}
      >
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={home}
          className="h-9 min-w-[240px] flex-1 rounded-md bg-bg px-3 text-sm text-fg shadow-[var(--shadow-border)]"
        />
        <Button type="submit" size="sm" disabled={!!busy}>
          {busy === "url" ? "Reading…" : "Check this URL"}
        </Button>
        <Button type="button" variant="ghost" size="sm" disabled={!!busy} onClick={() => void onUrl(false)}>
          Use saved copy
        </Button>
      </form>
      {err ? <p className="mt-2 text-sm text-danger">{err}</p> : null}
      {summary ? <p className="mt-2 font-mono text-[11px] text-muted">{summary}</p> : null}
      {liveNodes.length ? (
        <div className="mt-2 rounded-md bg-bg p-2">
          <p className="text-[10px] uppercase tracking-wide text-subtle">JSON-LD on this URL</p>
          <ul className="mt-1 space-y-0.5 font-mono text-[11px] text-fg">
            {liveNodes.map((n, i) => (
              <li key={`${n.id}-${i}`}>
                {n.types.join(" · ") || "(untyped)"}
                {n.id ? <span className="text-muted"> · {n.id}</span> : null}
                {n.name ? <span className="text-subtle"> · {n.name}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {rows.length ? (
        <ul className="mt-2 max-h-40 space-y-1 overflow-auto text-sm">
          {rows.map((r) => (
            <li key={r.url} className="flex flex-wrap items-center gap-2">
              <Badge tone={r.fail ? "danger" : "ok"}>{r.fail ? `${r.fail} fail` : "pass"}</Badge>
              <Badge>{r.source}</Badge>
              <a href={r.url} target="_blank" rel="noreferrer" className="truncate text-fdr hover:underline">
                {r.url.replace(/^https:\/\//, "")}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="mt-2 text-[11px] text-subtle">
        Common rules run on every brand. FDR / Achieve add brand pins (Organization @id, loan properties).{" "}
        <Link to="/empty" className="text-fdr hover:underline">
          Empty-data pages
        </Link>
      </p>
    </div>
  );
}
