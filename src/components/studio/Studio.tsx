import { useEffect, useState } from "react";
import {
  GitBranch,
  LayoutGrid,
  ListChecks,
  MapPin,
  Scale,
  Settings2,
  Shield,
  Search,
  Compass,
} from "lucide-react";
import { crawl } from "@/data/crawl";
import { RULES } from "@/data/rules-seed";
import { PRODUCT_LABEL, type ProductId } from "@/lib/graph/types";
import { recrawl } from "@/lib/server/ops";
import { runValidation } from "@/lib/server/validate-run";
import { Button } from "@/components/ui/button";
import { GraphCanvas } from "@/components/studio/GraphCanvas";
import { Explore } from "@/components/studio/Explore";
import { Inspector } from "@/components/studio/Inspector";
import { ValidationTable } from "@/components/studio/ValidationTable";
import { Backlog } from "@/components/studio/Backlog";
import { Rules } from "@/components/studio/Rules";
import { ConfigPanel } from "@/components/studio/ConfigPanel";
import { Gate } from "@/components/studio/Gate";
import { StatesPanel } from "@/components/studio/StatesPanel";
import { HSplit, VSplit } from "@/components/studio/SplitPane";
import { useStudio, type StudioTab } from "@/store/studio";
import { UserButton } from "@/lib/auth/gates";
import { filterIssues, filterStates } from "@/lib/studio/query";
import { statesData } from "@/data/states";
import { loadNote, saveNote } from "@/lib/server/studio-db";

const TABS: { id: StudioTab; label: string; icon: typeof GitBranch; hint: string }[] = [
  { id: "graph", label: "Graph", icon: GitBranch, hint: "Brands and products. Issues live on the edges." },
  { id: "explore", label: "Explore", icon: Compass, hint: "Tree suggestions as a table. Analyse and export." },
  { id: "states", label: "States", icon: MapPin, hint: "Where each product is offered or licensed." },
  { id: "validation", label: "Validation", icon: LayoutGrid, hint: "Table of website validation points." },
  { id: "rules", label: "Rules", icon: Scale, hint: "The checks the gate runs." },
  { id: "issues", label: "Issues", icon: ListChecks, hint: "Website validation points to fix." },
  { id: "gate", label: "Gate", icon: Shield, hint: "Pass or fail before publish." },
  { id: "config", label: "Config", icon: Settings2, hint: "Where data lives and brand JSON." },
];

const PRODUCTS: Array<"all" | ProductId> = [
  "all",
  "debt-relief",
  "settlement",
  "heloc",
  "hel",
  "personal-loan",
  "consolidation",
  "glossary",
];

export function Studio() {
  const tab = useStudio((s) => s.tab);
  const setTab = useStudio((s) => s.setTab);
  const explode = useStudio((s) => s.explode);
  const setExplode = useStudio((s) => s.setExplode);
  const brand = useStudio((s) => s.brand);
  const setBrand = useStudio((s) => s.setBrand);
  const product = useStudio((s) => s.product);
  const setProduct = useStudio((s) => s.setProduct);
  const layer = useStudio((s) => s.layer);
  const setLayer = useStudio((s) => s.setLayer);
  const impact = useStudio((s) => s.impact);
  const setImpact = useStudio((s) => s.setImpact);
  const query = useStudio((s) => s.query);
  const setQuery = useStudio((s) => s.setQuery);
  const selectedIssueId = useStudio((s) => s.selectedIssueId);
  const maximized = useStudio((s) => s.maximized);
  const setMaximized = useStudio((s) => s.setMaximized);
  const [crawlMsg, setCrawlMsg] = useState<string | null>(null);
  const [crawling, setCrawling] = useState(false);
  const [checking, setChecking] = useState(false);
  const [draft, setDraft] = useState("");
  const openCount = RULES.filter((i) => i.status === "open").length;
  const issueHits = filterIssues(RULES, { brand, product, layer, impact, query }).length;
  const stateHits = filterStates(statesData.states, { brand, product, query }).length;

  useEffect(() => {
    const key = selectedIssueId ?? tab;
    void loadNote({ data: { pageKey: key } })
      .then((r) => setDraft(r.body))
      .catch(() => setDraft(""));
  }, [selectedIssueId, tab]);

  async function onCrawl() {
    setCrawling(true);
    setCrawlMsg(null);
    try {
      const res = await recrawl();
      setCrawlMsg(
        `Live crawl ${res.crawledAt.slice(0, 19)} · FDR ${res.counts.fdr} · Achieve ${res.counts.achieve}`,
      );
    } catch (err) {
      setCrawlMsg(err instanceof Error ? err.message : "Crawl failed");
    } finally {
      setCrawling(false);
    }
  }

  async function onCheck() {
    setChecking(true);
    setCrawlMsg(null);
    try {
      const res = await runValidation({
        data: { scope: brand === "all" ? "all" : brand, brand, product, live: false, limit: 12 },
      });
      setCrawlMsg(`Checked ${res.pages} crawled pages · ${res.fail} issues · no recrawl`);
      setTab("validation");
    } catch (err) {
      setCrawlMsg(err instanceof Error ? err.message : "Check failed");
    } finally {
      setChecking(false);
    }
  }

  const main = (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col">
      {tab === "graph" ? (
        <div className="min-h-0 flex-1 p-3">
          <GraphCanvas />
        </div>
      ) : null}
      {tab === "explore" ? <Explore /> : null}
      {tab === "states" ? <StatesPanel /> : null}
      {tab === "validation" ? <ValidationTable /> : null}
      {tab === "rules" ? <Rules /> : null}
      {tab === "issues" ? <Backlog /> : null}
      {tab === "gate" ? <Gate /> : null}
      {tab === "config" ? <ConfigPanel /> : null}
    </section>
  );

  return (
    <div className="flex min-h-dvh min-w-0 flex-col overflow-x-hidden overflow-y-auto bg-bg text-fg">
      <header className="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b border-border bg-bg px-4 py-3">
        <div className="mr-2">
          <p className="font-display text-2xl leading-none tracking-tight">Origin</p>
          <p className="text-[10px] uppercase tracking-[0.2em] text-subtle">Content Graph Studio</p>
        </div>
        <nav className="flex flex-wrap rounded-lg bg-surface p-1" aria-label="Primary">
          {TABS.map((t) => {
            const Icon = t.icon;
            const on = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                title={t.hint}
                className={`inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm ${
                  on ? "bg-accent text-accent-fg" : "text-muted hover:bg-raised hover:text-fg"
                }`}
              >
                <Icon className="size-3.5" />
                {t.label}
              </button>
            );
          })}
        </nav>
        <div className="ml-auto flex flex-wrap items-center gap-2 text-xs text-muted">
          <span className="font-mono tabular-nums">FDR {crawl.counts.fdr.toLocaleString()}</span>
          <span className="text-subtle">·</span>
          <span className="font-mono tabular-nums">Achieve {crawl.counts.achieve.toLocaleString()}</span>
          <span className="text-subtle">·</span>
          <span className="font-mono tabular-nums">{openCount} open</span>
          <UserButton />
        </div>
      </header>

      <div className="sticky top-[57px] z-10 flex flex-wrap items-center gap-2 border-b border-border bg-bg px-4 py-2">
        <label className="flex items-center gap-2 text-xs text-muted" title="Which origin to show. Updates every list and the graph.">
          <span>Brand</span>
          <select
            value={brand}
            onChange={(e) => setBrand(e.target.value as typeof brand)}
            className="h-9 rounded-md bg-surface px-2 text-sm text-fg shadow-[var(--shadow-border)]"
          >
            <option value="all">All</option>
            <option value="fdr">Freedom Debt Relief</option>
            <option value="achieve">Achieve</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs text-muted" title="Product family on the site: debt relief, HELOC, glossary, and so on.">
          <span>Product</span>
          <select
            value={product}
            onChange={(e) => setProduct(e.target.value as typeof product)}
            className="h-9 rounded-md bg-surface px-2 text-sm text-fg shadow-[var(--shadow-border)]"
          >
            {PRODUCTS.map((p) => (
              <option key={p} value={p}>
                {p === "all" ? "All" : PRODUCT_LABEL[p]}
              </option>
            ))}
          </select>
        </label>
        <label
          className="flex items-center gap-2 text-xs text-muted"
          title="L1 is this page: headings, schema, copy. L2 is across brands: same slug, same ask, corporate sameAs."
        >
          <span>Layer</span>
          <select
            value={layer}
            onChange={(e) => setLayer(e.target.value as typeof layer)}
            className="h-9 rounded-md bg-surface px-2 text-sm text-fg shadow-[var(--shadow-border)]"
          >
            <option value="all">All — page and cross-brand</option>
            <option value="L1">L1 — this page (HTML, schema, copy)</option>
            <option value="L2">L2 — across brands (entity, slug, same ask)</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs text-muted" title="How badly the issue hurts ranking or compliance.">
          <span>Impact</span>
          <select
            value={impact}
            onChange={(e) => setImpact(e.target.value as typeof impact)}
            className="h-9 rounded-md bg-surface px-2 text-sm text-fg shadow-[var(--shadow-border)]"
          >
            <option value="all">All</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </label>
        <label className="relative min-w-[160px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-subtle" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search issues or states"
            suppressHydrationWarning
            className="h-9 w-full rounded-md bg-surface pl-8 pr-3 text-sm text-fg shadow-[var(--shadow-border)] placeholder:text-subtle"
          />
        </label>
        <label className="flex h-9 items-center gap-2 rounded-md bg-surface px-3 text-sm text-muted shadow-[var(--shadow-border)]">
          <input
            type="checkbox"
            checked={explode}
            onChange={(e) => setExplode(e.target.checked)}
            suppressHydrationWarning
            className="size-4 accent-[var(--color-accent)]"
          />
          Explode pages
        </label>
        {(tab === "graph" || tab === "states" || tab === "validation") && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setMaximized(maximized ? null : tab === "graph" ? "graph" : tab === "states" ? "states" : "validation")}
          >
            {maximized ? "Exit full screen" : "Full screen"}
          </Button>
        )}
        <Button variant="secondary" size="sm" onClick={() => void onCheck()} disabled={checking || crawling}>
          {checking ? "Checking…" : "Run checks"}
        </Button>
        <Button variant="secondary" size="sm" onClick={() => void onCrawl()} disabled={crawling}>
          {crawling ? "Crawling…" : "Live crawl"}
        </Button>
      </div>
      <p className="border-b border-border px-4 py-1.5 font-mono text-[11px] text-muted">
        Filters live · {issueHits} rules · {stateHits} states
        {crawlMsg ? ` · ${crawlMsg}` : ""}
      </p>

      <HSplit
        storageKey="origin.inspectorW"
        left={
          <VSplit
            storageKey="origin.writeH"
            top={main}
            bottom={
              <div className="flex h-full flex-col bg-surface p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[10px] uppercase tracking-wide text-subtle">
                    Write · {selectedIssueId ?? tab}
                  </p>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      void saveNote({ data: { pageKey: selectedIssueId ?? tab, body: draft } })
                    }
                  >
                    Save
                  </Button>
                </div>
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Draft the page copy or fix notes for this selection"
                  className="min-h-0 flex-1 resize-none rounded-md bg-bg p-2 text-sm text-fg shadow-[var(--shadow-border)]"
                />
              </div>
            }
          />
        }
        right={<Inspector />}
      />
    </div>
  );
}
