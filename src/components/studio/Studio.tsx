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
  Sparkles,
  Building2,
  Plus,
} from "lucide-react";
import { crawl } from "@/data/crawl";
import { RULES } from "@/data/rules-seed";
import { recrawl } from "@/lib/server/ops";
import { runValidation } from "@/lib/server/validate-run";
import { listOrgs, retrieveBrand } from "@/lib/server/orgs";
import { Button } from "@/components/ui/button";
import { GraphCanvas } from "@/components/studio/GraphCanvas";
import { Explore } from "@/components/studio/Explore";
import { Recommend } from "@/components/studio/Recommend";
import { Inspector } from "@/components/studio/Inspector";
import { ValidationTable } from "@/components/studio/ValidationTable";
import { Backlog } from "@/components/studio/Backlog";
import { Rules } from "@/components/studio/Rules";
import { ConfigPanel } from "@/components/studio/ConfigPanel";
import { Gate } from "@/components/studio/Gate";
import { StatesPanel } from "@/components/studio/StatesPanel";
import { Companies } from "@/components/studio/Companies";
import { HSplit, VSplit } from "@/components/studio/SplitPane";
import { familyContextFrom, useStudio, type StudioTab } from "@/store/studio";
import { familyPageCount, isSeedFamily, issueFitsFamily, productsForFamily } from "@/lib/org/catalog";
import { productLabel } from "@/lib/graph/types";
import { UserButton } from "@/lib/auth/gates";
import { filterIssues } from "@/lib/studio/query";
import { loadNote, saveNote } from "@/lib/server/studio-db";
import { RegisterFamilyModal } from "@/components/studio/RegisterFamilyModal";
import { IssueDrawer } from "@/components/studio/IssueDrawer";

const TABS: { id: StudioTab; label: string; icon: typeof GitBranch; hint: string }[] = [
  { id: "companies", label: "Companies", icon: Building2, hint: "Parent company, sub-brands, retrieve from URL, coverage." },
  { id: "graph", label: "Graph", icon: GitBranch, hint: "Brands and products. Issues live on the edges." },
  { id: "explore", label: "Explore", icon: Compass, hint: "Tree suggestions as a table. Analyse and export." },
  { id: "recommend", label: "Recommend", icon: Sparkles, hint: "Ideal graph, FDR vs Achieve, SERP and AI payoff." },
  { id: "states", label: "States", icon: MapPin, hint: "Where each product is offered or licensed." },
  { id: "validation", label: "Validation", icon: LayoutGrid, hint: "Table of website validation points." },
  { id: "rules", label: "Rules", icon: Scale, hint: "The checks the gate runs." },
  { id: "issues", label: "Issues", icon: ListChecks, hint: "Website validation points to fix." },
  { id: "gate", label: "Gate", icon: Shield, hint: "Pass or fail before publish." },
  { id: "config", label: "Config", icon: Settings2, hint: "Where data lives and brand JSON." },
];

const TAB_GROUPS: { label: string; items: typeof TABS }[] = [
  { label: "Family", items: byId("companies") },
  { label: "Map", items: byId("graph", "explore", "recommend", "states") },
  { label: "Work", items: byId("issues", "validation", "gate", "rules") },
  { label: "Setup", items: byId("config") },
];

function byId(...ids: StudioTab[]) {
  return ids.map((id) => TABS.find((t) => t.id === id)!);
}

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
  const graphOrg = useStudio((s) => s.graphOrg);
  const setRegisterOpen = useStudio((s) => s.setRegisterOpen);
  const applyFamilyContext = useStudio((s) => s.applyFamilyContext);
  const selectParent = useStudio((s) => s.selectParent);
  const parents = useStudio((s) => s.parents);
  const parentId = useStudio((s) => s.parentId);
  const parentSlug = useStudio((s) => s.parentSlug);
  const attachedRuleCodes = useStudio((s) => s.attachedRuleCodes);
  const allBrands = useStudio((s) => s.allBrands);
  const seedFamily = isSeedFamily(graphOrg, parentSlug);
  const [crawlMsg, setCrawlMsg] = useState<string | null>(null);
  const [crawling, setCrawling] = useState(false);
  const [checking, setChecking] = useState(false);
  const [draft, setDraft] = useState("");
  const [notesOpen, setNotesOpen] = useState(false);
  const showFilters = tab === "issues" || tab === "validation" || tab === "explore" || tab === "graph" || tab === "states" || tab === "gate";
  const visibleIssues = filterIssues(RULES, { brand, product, layer, impact, query, codes: attachedRuleCodes }).filter((i) =>
    issueFitsFamily(i, graphOrg, parentSlug),
  );
  const openCount = visibleIssues.filter((i) => i.status === "open").length;
  const familyPages = familyPageCount(graphOrg);
  const productOptions = productsForFamily(graphOrg?.brands ?? [], brand);

  useEffect(() => {
    void listOrgs()
      .then((d) => applyFamilyContext(familyContextFrom(d)))
      .catch(() => {
        /* seed graph still works */
      });
  }, [applyFamilyContext]);

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
      if (seedFamily) {
        const res = await recrawl();
        setCrawlMsg(`Live crawl ${res.crawledAt.slice(0, 19)} · FDR ${res.counts.fdr} · Achieve ${res.counts.achieve}`);
      } else {
        const brands = allBrands.filter((b) => b.parentId === parentId && b.website);
        for (const b of brands) await retrieveBrand({ data: { id: b.id } });
        setCrawlMsg(`Retrieved ${brands.length} ${graphOrg?.parent?.name ?? "family"} homepage${brands.length === 1 ? "" : "s"}`);
      }
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
        data: { scope: brand === "all" ? "all" : brand, brand, product, live: false, limit: 12, parentId: parentId || undefined },
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
      {tab === "companies" ? <Companies /> : null}
      {tab === "graph" ? (
        <div className="min-h-0 flex-1 p-3">
          <GraphCanvas />
        </div>
      ) : null}
      {tab === "explore" ? <Explore /> : null}
      {tab === "recommend" ? <Recommend /> : null}
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
      <header className="sticky top-0 z-20 flex flex-wrap items-center gap-2 border-b border-border bg-bg px-4 py-2">
        <div className="mr-1">
          <p className="font-display text-lg leading-none tracking-tight">
            {graphOrg?.parent?.name ?? "Pantheon"}
          </p>
          <p className="vh-kicker mt-0.5">{openCount} open</p>
        </div>
        <div className="g-cluster" role="group" aria-label="Family context">
        <label className="flex items-center gap-2 text-xs text-muted" title="Holding company. Every tab and the inspector follow this family.">
          <span>Family</span>
          <select
            value={parentId}
            onChange={(e) => selectParent(e.target.value)}
            className="h-8 rounded-md bg-bg px-2 text-sm text-fg shadow-[var(--shadow-border)]"
          >
            {(parents.length ? parents : [{ id: parentId, name: graphOrg?.parent?.name ?? "Pantheon" }]).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs text-muted" title="Sub-company under the selected parent.">
          <span>Brand</span>
          <select
            value={brand}
            onChange={(e) => setBrand(e.target.value as typeof brand)}
            className="h-8 rounded-md bg-bg px-2 text-sm text-fg shadow-[var(--shadow-border)]"
          >
            <option value="all">All brands</option>
            {(graphOrg?.brands ?? []).map((b) => (
              <option key={b.slug} value={b.slug}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs text-muted" title="Product family on the site.">
          <span>Product</span>
          <select
            value={product}
            onChange={(e) => setProduct(e.target.value as typeof product)}
            className="h-8 rounded-md bg-bg px-2 text-sm text-fg shadow-[var(--shadow-border)]"
          >
            {productOptions.length === 0 ? (
              <option value="all">All products</option>
            ) : (
              <>
                <option value="all">All products</option>
                {productOptions.map((p) => (
                  <option key={p} value={p}>
                    {productLabel(p)}
                  </option>
                ))}
              </>
            )}
          </select>
        </label>
        </div>
        <div className="ml-auto g-cluster" role="group" aria-label="Family actions">
          {seedFamily ? (
            <span className="vh-whisper font-mono tabular-nums">
              FDR {crawl.counts.fdr.toLocaleString()} · Achieve {crawl.counts.achieve.toLocaleString()}
            </span>
          ) : (
            <span className="vh-whisper font-mono tabular-nums">
              {familyPages.toLocaleString()} pages
            </span>
          )}
          <Button size="sm" onClick={() => setRegisterOpen(true)}>
            <Plus className="size-3.5" />
            New family
          </Button>
          <UserButton />
        </div>
      </header>

      <nav className="flex flex-wrap items-end gap-3 border-b border-border bg-bg px-4 py-1.5" aria-label="Primary">
        {TAB_GROUPS.map((group) => (
          <div key={group.label} className="g-cluster g-cluster-flat" role="group" aria-label={group.label}>
            <span className="vh-kicker px-1">{group.label}</span>
            <div className="flex flex-wrap rounded-md bg-surface p-0.5">
              {group.items.map((t) => {
                const Icon = t.icon;
                const on = tab === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    title={t.hint}
                    className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs ${
                      on ? "bg-accent text-accent-fg" : "text-muted hover:bg-raised hover:text-fg"
                    }`}
                  >
                    <Icon className="size-3.5" />
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {showFilters ? (
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-border bg-bg px-4 py-1.5">
        <div className="g-cluster min-w-0 flex-1" role="group" aria-label="Filters">
        <label
          className="flex items-center gap-2 text-xs text-muted"
          title="L1 is this page: headings, schema, copy. L2 is across brands: same slug, same ask, corporate sameAs."
        >
          <span>Layer</span>
          <select
            value={layer}
            onChange={(e) => setLayer(e.target.value as typeof layer)}
            className="h-8 rounded-md bg-bg px-2 text-sm text-fg shadow-[var(--shadow-border)]"
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
            className="h-8 rounded-md bg-bg px-2 text-sm text-fg shadow-[var(--shadow-border)]"
          >
            <option value="all">All</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </label>
        <label className="relative min-w-[140px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-subtle" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search issues or states"
            suppressHydrationWarning
            className="h-8 w-full rounded-md bg-bg pl-8 pr-3 text-sm text-fg shadow-[var(--shadow-border)] placeholder:text-subtle"
          />
        </label>
        </div>
        <div className="g-cluster" role="group" aria-label="Actions">
        {tab === "graph" ? (
        <label className="flex h-8 items-center gap-2 px-1 text-sm text-muted">
          <input
            type="checkbox"
            checked={explode}
            onChange={(e) => setExplode(e.target.checked)}
            suppressHydrationWarning
            className="size-4 accent-[var(--color-accent)]"
          />
          Explode pages
        </label>
        ) : null}
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
        <Button variant="secondary" size="sm" onClick={() => setNotesOpen((v) => !v)}>
          {notesOpen ? "Hide notes" : "Notes"}
        </Button>
        {crawlMsg ? <span className="vh-whisper max-w-[280px] truncate">{crawlMsg}</span> : null}
        </div>
      </div>
      ) : (
        <div className="flex items-center gap-2 border-b border-border px-4 py-1.5">
          <Button variant="secondary" size="sm" onClick={() => void onCrawl()} disabled={crawling}>
            {crawling ? "Crawling…" : "Live crawl"}
          </Button>
          {crawlMsg ? <span className="vh-whisper truncate">{crawlMsg}</span> : null}
        </div>
      )}

      <HSplit
        storageKey="origin.inspectorW"
        left={
          notesOpen ? (
            <VSplit
              storageKey="origin.writeH"
              top={main}
              bottom={
                <div className="flex h-full flex-col bg-surface p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="vh-kicker">Notes · {selectedIssueId ?? graphOrg?.parent?.name ?? tab}</p>
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
          ) : (
            main
          )
        }
        right={<Inspector />}
      />
      <RegisterFamilyModal />
      <IssueDrawer />
    </div>
  );
}
