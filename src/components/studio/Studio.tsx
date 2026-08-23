import { useState } from "react";
import {
  GitBranch,
  LayoutGrid,
  ListChecks,
  Shield,
  Search,
} from "lucide-react";
import { crawl } from "@/data/crawl";
import { ISSUES } from "@/data/issues";
import { PRODUCT_LABEL, type ProductId } from "@/lib/graph/types";
import { recrawl } from "@/lib/server/ops";
import { Button } from "@/components/ui/button";
import { GraphCanvas } from "@/components/studio/GraphCanvas";
import { Inspector } from "@/components/studio/Inspector";
import { ValidationTable } from "@/components/studio/ValidationTable";
import { Backlog } from "@/components/studio/Backlog";
import { Gate } from "@/components/studio/Gate";
import { useStudio, type StudioTab } from "@/store/studio";

const TABS: { id: StudioTab; label: string; icon: typeof GitBranch }[] = [
  { id: "graph", label: "Graph", icon: GitBranch },
  { id: "validation", label: "Validation", icon: LayoutGrid },
  { id: "backlog", label: "Backlog", icon: ListChecks },
  { id: "gate", label: "Gate", icon: Shield },
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
  const [crawlMsg, setCrawlMsg] = useState<string | null>(null);
  const [crawling, setCrawling] = useState(false);
  const openCount = ISSUES.filter((i) => i.status === "open").length;

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

  return (
    <div className="flex h-dvh flex-col bg-bg text-fg">
      <header className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <div className="mr-2">
          <p className="font-display text-2xl leading-none tracking-tight">Origin</p>
          <p className="text-[10px] uppercase tracking-[0.2em] text-subtle">Content Graph Studio</p>
        </div>
        <nav className="flex rounded-lg bg-surface p-1" aria-label="Primary">
          {TABS.map((t) => {
            const Icon = t.icon;
            const on = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm ${
                  on ? "bg-raised text-fg" : "text-muted hover:text-fg"
                }`}
              >
                <Icon className="size-3.5" />
                {t.label}
              </button>
            );
          })}
        </nav>
        <div className="ml-auto flex flex-wrap items-center gap-2 text-xs text-muted">
          <span className="font-mono tabular-nums">
            FDR {crawl.counts.fdr.toLocaleString()}
          </span>
          <span className="text-subtle">·</span>
          <span className="font-mono tabular-nums">
            Achieve {crawl.counts.achieve.toLocaleString()}
          </span>
          <span className="text-subtle">·</span>
          <span className="font-mono tabular-nums">{openCount} open</span>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
        <label className="flex items-center gap-2 text-xs text-muted">
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
        <label className="flex items-center gap-2 text-xs text-muted">
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
        <label className="flex items-center gap-2 text-xs text-muted">
          <span>Layer</span>
          <select
            value={layer}
            onChange={(e) => setLayer(e.target.value as typeof layer)}
            className="h-9 rounded-md bg-surface px-2 text-sm text-fg shadow-[var(--shadow-border)]"
          >
            <option value="all">L1 + L2</option>
            <option value="L1">L1 page</option>
            <option value="L2">L2 cross-brand</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs text-muted">
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
            placeholder="Search issues"
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
        <Button variant="secondary" size="sm" onClick={() => void onCrawl()} disabled={crawling}>
          {crawling ? "Crawling…" : "Live crawl"}
        </Button>
      </div>
      {crawlMsg ? (
        <p className="border-b border-border px-4 py-1.5 font-mono text-[11px] text-muted">{crawlMsg}</p>
      ) : null}

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="flex min-h-0 flex-col border-b border-border lg:border-b-0 lg:border-r">
          {tab === "graph" ? (
            <div className="min-h-0 flex-1 p-3">
              <GraphCanvas />
            </div>
          ) : null}
          {tab === "validation" ? <ValidationTable /> : null}
          {tab === "backlog" ? <Backlog /> : null}
          {tab === "gate" ? <Gate /> : null}
        </section>
        <Inspector />
      </div>
    </div>
  );
}
