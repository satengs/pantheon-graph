import { ExternalLink } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { RULES } from "@/data/rules-seed";
import { crawl } from "@/data/crawl";
import { buildGraph, toneRatio } from "@/lib/graph/model";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useStudio } from "@/store/studio";
import { BRAND_LABEL } from "@/lib/graph/types";
import { runPsi } from "@/lib/server/ops";
import { listStudio } from "@/lib/server/studio-db";
import { analyzePage } from "@/lib/server/analyze-page";
import { ISSUE_PROOFS } from "@/data/issue-proofs";
import { jsonLdDiff } from "@/lib/html/json-diff";
import { identifyServices, SERVICE_CATALOG, stateByCode, statesData, statusTone, type StateRow } from "@/data/states";
import { issueFitsFamily, isSeedFamily, urlInFamily } from "@/lib/org/catalog";
import { isHiddenUiCode } from "@/lib/studio/query";
import { EmptyFamilyCrawl } from "@/components/studio/EmptyFamilyCrawl";
import { pagePath } from "@/lib/studio/issue-detail";
import { pagesForRule } from "@/lib/studio/rule-pages";
import { IssueMindMap } from "@/components/studio/IssueMindMap";
import { recForCode } from "@/data/recommend";
import { PageMeta } from "@/components/studio/PageMeta";

export function Inspector() {
  const explode = useStudio((s) => s.explode);
  const brand = useStudio((s) => s.brand);
  const product = useStudio((s) => s.product);
  const layer = useStudio((s) => s.layer);
  const selectedNodeId = useStudio((s) => s.selectedNodeId);
  const selectedIssueId = useStudio((s) => s.selectedIssueId);
  const selectedState = useStudio((s) => s.selectedState);
  const tab = useStudio((s) => s.tab);
  const hoveredIssueId = useStudio((s) => s.hoveredIssueId);
  const selectedFindingId = useStudio((s) => s.selectedFindingId);
  const drawerPageUrl = useStudio((s) => s.drawerPageUrl);
  const selectIssue = useStudio((s) => s.selectIssue);
  const openIssueDrawer = useStudio((s) => s.openIssueDrawer);
  const [psiLive, setPsiLive] = useState<number | null>(null);
  const [psiBusy, setPsiBusy] = useState(false);
  const [findings, setFindings] = useState<
    Array<{ id: string; code: string; title: string; url: string; why: string; found: string; suggested: string }>
  >([]);
  const [analyzeBusy, setAnalyzeBusy] = useState(false);

  const graphFocusStack = useStudio((s) => s.graphFocusStack);
  const includeParent = useStudio((s) => s.includeParent);
  const graphOrg = useStudio((s) => s.graphOrg);
  const attachedRuleCodes = useStudio((s) => s.attachedRuleCodes);
  const parentSlug = useStudio((s) => s.parentSlug);
  const seedFamily = isSeedFamily(graphOrg, parentSlug);

  const graph = useMemo(
    () =>
      buildGraph({
        explode,
        brand,
        product,
        layer,
        expandIds: graphFocusStack,
        includeParent,
        org: graphOrg ?? undefined,
        ruleCodes: attachedRuleCodes,
      }),
    [explode, brand, product, layer, graphFocusStack, includeParent, graphOrg, attachedRuleCodes],
  );
  const node = graph.nodes.find((n) => n.id === selectedNodeId) ?? null;
  const wantedId =
    tab === "issues"
      ? hoveredIssueId ?? selectedIssueId
      : null;
  const rawIssue = RULES.find((i) => i.id === wantedId && (!attachedRuleCodes.length || attachedRuleCodes.includes(i.code))) ?? null;
  const issue = rawIssue && !isHiddenUiCode(rawIssue.code) && issueFitsFamily(rawIssue, graphOrg, parentSlug) ? rawIssue : null;
  const familyFindings = findings.filter((f) => (seedFamily ? true : urlInFamily(f.url, graphOrg)));
  const toneText = issue ? `${issue.title} ${issue.reason} ${issue.fix}` : "";
  const toneBrand = issue?.domain === "achieve" ? "achieve" : "fdr";
  const tone = toneRatio(toneText, toneBrand);
  const finding = familyFindings.find((f) => f.id === selectedFindingId);
  const proofView = issue ? ISSUE_PROOFS[issue.code] : undefined;
  const catPages = issue ? pagesForRule(issue, familyFindings) : [];
  const focusUrl = drawerPageUrl || finding?.url || (catPages.length === 1 ? catPages[0]?.url : "") || "";

  useEffect(() => {
    void listStudio()
      .then((d) => setFindings(d.findings))
      .catch(() => setFindings([]));
  }, [selectedFindingId, selectedIssueId]);

  async function fetchPsi() {
    const url = node?.url ?? issue?.urls[0];
    if (!url) return;
    setPsiBusy(true);
    try {
      const res = await runPsi({ data: url });
      if (res.ok) setPsiLive(res.performance);
    } catch {
      setPsiLive(null);
    } finally {
      setPsiBusy(false);
    }
  }

  const row = selectedState ? stateByCode(selectedState) : undefined;
  if (tab === "states") {
    if (row) return <StateInspector row={row} />;
    return <StatesOverview />;
  }
  if (tab === "graph" && node && node.kind !== "issue") {
    return (
      <aside className="flex h-full min-h-0 min-w-0 flex-col gap-3 overflow-y-auto p-4">
        <p className="text-[10px] uppercase tracking-wide text-subtle">{node.kind}</p>
        <h2 className="font-display text-xl text-fg">{node.label}</h2>
        {node.url ? (
          <a href={node.url} target="_blank" rel="noreferrer" className="font-mono text-xs text-muted hover:text-fg">
            {node.url}
          </a>
        ) : null}
        {node.count != null ? <p className="text-sm text-muted">{node.count.toLocaleString()} pages</p> : null}
        {node.kind === "page" || node.url ? <PageMeta url={node.url} /> : null}
        {node.kind !== "page" ? (
          <p className="text-sm text-muted">
            {seedFamily ? "This node in the family graph." : "No crawled pages for this company yet."}
          </p>
        ) : null}
        {!seedFamily && node.kind !== "page" ? <EmptyFamilyCrawl /> : null}
      </aside>
    );
  }
  if (tab === "issues" && !issue && finding) {
    return (
      <aside className="flex h-full min-h-0 min-w-0 flex-col gap-3 overflow-y-auto p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-subtle">HTML finding</p>
            <h2 className="font-display text-xl text-fg text-balance">{finding.title}</h2>
          </div>
          <Button size="sm" onClick={() => openIssueDrawer({ findingId: finding.id, issueId: null })}>
            View issue
          </Button>
        </div>
        <p className="font-mono text-xs text-fg rounded-md bg-raised px-2 py-1 shadow-[var(--shadow-border)]">
          {finding.url.replace(/^https?:\/\//, "")}
        </p>
        <p className="text-sm text-muted text-pretty">{finding.why}</p>
      </aside>
    );
  }
  if (tab !== "issues" || !issue) {
    return (
      <aside className="flex h-full min-h-0 min-w-0 flex-col overflow-y-auto">
        <EmptyFamilyCrawl
          title={seedFamily ? "Nothing selected" : undefined}
          detail={
            seedFamily
              ? "Pick an issue from the list."
              : undefined
          }
        />
      </aside>
    );
  }

  const rec = recForCode(issue.code);

  return (
    <aside className="flex h-full min-h-0 min-w-0 flex-col gap-4 overflow-y-auto p-4">
      <header>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-xs text-subtle">{issue.code}</p>
            <h2 className="mt-1 text-lg font-medium text-fg text-balance">{issue.title}</h2>
          </div>
          <Button size="sm" onClick={() => openIssueDrawer({ issueId: issue.id, pageUrl: focusUrl || issue.urls[0] })}>
            View issue
          </Button>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Badge tone={issue.impact === "critical" ? "danger" : issue.impact === "high" ? "warn" : "neutral"}>
            {issue.impact}
          </Badge>
          <Badge>{issue.layer}</Badge>
        </div>
        <p className="vh-kicker mt-4">Why</p>
        <p className="vh-what mt-1">{issue.reason}</p>
        <p className="vh-kicker mt-4">Solution</p>
        <p className="vh-fix mt-1">{issue.fix}</p>
      </header>

      {seedFamily && rec ? (
        <div>
          <p className="vh-kicker">SERP</p>
          <p className="vh-what mt-1">{rec.serp}</p>
          <p className="vh-kicker mt-3">AI</p>
          <p className="vh-what mt-1">{rec.ai}</p>
        </div>
      ) : null}

      <IssueMindMap code={issue.code} />

      {catPages.length ? (
        <div>
          <p className="vh-kicker">{catPages.length} pages</p>
          <ul className="mt-2">
            {catPages.map((p) => {
              const on = focusUrl === p.url;
              return (
                <li key={p.url}>
                  <button
                    type="button"
                    className={`block w-full truncate px-0 py-1.5 text-left font-mono text-[13px] hover:text-fg ${
                      on ? "text-fg" : "text-muted"
                    }`}
                    onClick={() => selectIssue(issue.code, on ? null : p.url)}
                  >
                    {p.path}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {tab === "issues" ? null : (
        <>
      {proofView ? (
        <section className="rounded-lg bg-raised p-3">
          <h3 className="text-[11px] font-medium uppercase tracking-wide text-subtle">Proof · last crawl + captured HTML</h3>
          <p className="mt-2 text-xs text-danger">{proofView.conflict}</p>
          <ul className="mt-3 space-y-2">
            {proofView.rows.map((row) => (
              <li key={row.url} className="rounded-md bg-bg p-2">
                <div className="flex items-center gap-2">
                  <Badge tone={row.brand === "fdr" ? "fdr" : "achieve"}>{row.brand}</Badge>
                </div>
                <p className="mt-1 text-xs text-fg">{row.h1 || "(no H1)"}</p>
                <p className="mt-1 font-mono text-[10px] text-muted">
                  canonical → {row.canonical.replace(/^https:\/\//, "") || "(none)"}
                </p>
                <p className="mt-1 text-[10px] text-subtle">{row.extra}</p>
                <a href={row.url} target="_blank" rel="noreferrer" className="mt-1 inline-flex text-[10px] text-fdr hover:underline">
                  {row.url.replace(/^https:\/\//, "")} <ExternalLink className="size-3" />
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rounded-lg bg-raised p-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-[11px] font-medium uppercase tracking-wide text-subtle">
            {finding && /^(S05|S07|S08|S21|S26|S27|S28|S29|S30|S31)$/.test(finding.code) ? "JSON-LD diff" : "Found vs suggested"}
          </h3>
          {issue.urls[0] ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={analyzeBusy}
              onClick={() => {
                setAnalyzeBusy(true);
                void analyzePage({ data: { url: issue.urls[0]! } })
                  .then((res) => {
                    const mapped = res.findings.map((f) => ({
                      id: f.id,
                      code: f.code,
                      title: f.title,
                      url: f.url,
                      why: f.why,
                      found: f.found,
                      suggested: f.suggested,
                    }));
                    setFindings((prev) => mapped.concat(prev.filter((p) => p.url !== issue.urls[0])));
                  })
                  .finally(() => setAnalyzeBusy(false));
              }}
            >
              {analyzeBusy ? "Reading…" : "Re-read page"}
            </Button>
          ) : null}
        </div>
        {finding ? (
          <div className="mt-2 space-y-2">
            <p className="text-sm text-muted">{finding.why}</p>
            <JsonLdDiffBlock found={finding.found} suggested={finding.suggested} />
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted">
            Run outline on this URL from Backlog. Logic is local (headings, FAQ, related, footer vs main). Optional HTTPS workflow URL can be stored in FDR JSON as analyzeEndpoint.
          </p>
        )}
      </section>

      <section className="rounded-lg bg-raised p-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-[11px] font-medium uppercase tracking-wide text-subtle">
            Acceptance
          </h3>
          <div className="flex gap-1.5">
            <Badge tone={issue.acceptance.originPass ? "ok" : "danger"}>
              origin {issue.acceptance.originPass ? "pass" : "fail"}
            </Badge>
            <Badge tone={issue.acceptance.pagePass ? "ok" : "danger"}>
              page {issue.acceptance.pagePass ? "pass" : "fail"}
            </Badge>
          </div>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <div>
            <dt className="text-subtle">PageSpeed</dt>
            <dd className="font-mono tabular-nums text-fg">
              {psiLive ?? issue.acceptance.psi.performance}
            </dd>
          </div>
          <div>
            <dt className="text-subtle">LCP</dt>
            <dd className="font-mono tabular-nums text-fg">{issue.acceptance.psi.lcpMs} ms</dd>
          </div>
          <div>
            <dt className="text-subtle">CWV</dt>
            <dd className="uppercase">{issue.acceptance.cwv}</dd>
          </div>
          <div>
            <dt className="text-subtle">Cloudflare</dt>
            <dd className="font-mono">{issue.acceptance.cache}</dd>
          </div>
        </dl>
        <Button
          variant="ghost"
          size="sm"
          className="mt-2 w-full"
          onClick={() => void fetchPsi()}
          disabled={psiBusy}
        >
          {psiBusy ? "Fetching PageSpeed…" : "Fetch live PageSpeed"}
        </Button>
      </section>

      <section>
        <div className="flex items-center justify-between">
          <h3 className="text-[11px] font-medium uppercase tracking-wide text-subtle">
            Tone tokens · {BRAND_LABEL[toneBrand]}
          </h3>
          <span className="font-mono text-xs tabular-nums text-muted">
            {(tone.ratio * 100).toFixed(0)}% on-brand
          </span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-raised">
          <div
            className="h-full rounded-full bg-accent"
            style={{ width: `${Math.round(tone.ratio * 100)}%` }}
          />
        </div>
        <p className="mt-1 text-xs text-subtle">
          {tone.on} on-brand · {tone.off} off-brand · fail if ratio under 72%
        </p>
      </section>


      <section>
        <h3 className="text-[11px] font-medium uppercase tracking-wide text-subtle">
          Citations
        </h3>
        <ul className="mt-2 flex flex-col gap-2">
          {issue.citations.map((c) => (
            <li key={c.url + c.location} className="rounded-lg bg-raised p-3">
              <div className="flex items-center justify-between gap-2">
                <Badge tone={c.brand === "fdr" ? "fdr" : "achieve"}>{c.brand}</Badge>
                <span className="text-[10px] uppercase tracking-wide text-subtle">{c.location}</span>
              </div>
              <blockquote className="mt-2 text-sm text-fg text-pretty">“{c.quote}”</blockquote>
              <p className="mt-1 text-xs text-muted text-pretty">{c.whyReal}</p>
              <a
                href={c.url}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-xs text-fdr hover:underline"
              >
                {c.url.replace("https://www.", "")} <ExternalLink className="size-3" />
              </a>
            </li>
          ))}
        </ul>
      </section>

      <p className="text-[10px] text-subtle">
        {seedFamily
          ? `Graph version ${crawl.crawledAt} · ${crawl.counts.fdr} FDR · ${crawl.counts.achieve} Achieve`
          : `${graphOrg?.parent?.name ?? "Family"} · issues from this company's sites only`}
      </p>
      {seedFamily ? (
        <div className="flex flex-wrap gap-1">
          {RULES.filter((i) => attachedRuleCodes.includes(i.code) && issueFitsFamily(i, graphOrg, parentSlug)).map((i) => (
            <button
              key={i.id}
              type="button"
              onClick={() => selectIssue(i.id)}
              className={`h-7 rounded-sm px-2 font-mono text-[10px] ${
                issue.id === i.id ? "bg-accent text-accent-fg" : "bg-raised text-muted"
              }`}
            >
              {i.code}
            </button>
          ))}
        </div>
      ) : null}
        </>
      )}
    </aside>
  );
}




function JsonLdDiffBlock({ found, suggested }: { found: string; suggested: string }) {
  const lines = jsonLdDiff(found, suggested);
  return (
    <div className="overflow-x-auto rounded-md bg-bg p-2 font-mono text-[11px] leading-relaxed">
      <p className="mb-1 text-[10px] uppercase tracking-wide text-subtle">JSON-LD diff · red gone · green add</p>
      {lines.map((l, i) => (
        <div
          key={`${l.op}-${i}`}
          className={
            l.op === "del" ? "text-danger" : l.op === "add" ? "text-ok" : "text-muted"
          }
        >
          {l.op === "del" ? "− " : l.op === "add" ? "+ " : "  "}
          {l.text || " "}
        </div>
      ))}
    </div>
  );
}

function StateInspector({ row }: { row: StateRow }) {
  const services = identifyServices(row);
  const fdr = services.filter((s) => s.brand === "fdr");
  const achieve = services.filter((s) => s.brand === "achieve");
  const liveFdr = fdr.filter((s) => s.status !== "none");
  const liveAchieve = achieve.filter((s) => s.status !== "none");

  return (
    <aside className="flex h-full min-h-0 min-w-0 flex-col gap-4 overflow-y-auto p-4">
      <header>
        <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-subtle">State services</p>
        <h2 className="mt-1 font-display text-xl leading-tight text-fg">
          {row.name} <span className="font-mono text-sm text-muted">{row.code}</span>
        </h2>
        <p className="mt-1 text-sm text-muted">
          {liveFdr.length} FDR · {liveAchieve.length} Achieve services identified
        </p>
      </header>

      <BrandServices title="Freedom Debt Relief" tone="fdr" items={fdr} />
      <BrandServices title="Achieve" tone="achieve" items={achieve} />

      {row.fdrUrl ? (
        <a
          href={row.fdrUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-fdr hover:underline"
        >
          FDR {row.name} near-me page <ExternalLink className="size-3.5" />
        </a>
      ) : row.fdrCityPages ? (
        <p className="text-sm text-muted">
          {row.fdrCityPages} FDR city pages, no statewide landing.
        </p>
      ) : (
        <p className="text-sm text-subtle">No FDR near-me landing for this state.</p>
      )}

      <section>
        <h3 className="text-[11px] font-medium uppercase tracking-wide text-subtle">Achieve licenses</h3>
        {row.licenses.length === 0 ? (
          <p className="mt-2 text-sm text-muted">None listed on achieve.com/licenses.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {row.licenses.map((lic) => (
              <li key={lic.entity + lic.name + lic.number} className="rounded-lg bg-raised p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-fg">{lic.name}</span>
                  <Badge>{lic.kind}</Badge>
                </div>
                <p className="mt-1 font-mono text-xs text-muted">
                  {lic.entity} · NMLS {lic.nmls} · {lic.number}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="text-[10px] text-subtle">
        Snapshot {statesData.source.capturedAt}. {statesData.notes.fdrService}
      </p>
    </aside>
  );
}

function BrandServices({
  title,
  tone,
  items,
}: {
  title: string;
  tone: "fdr" | "achieve";
  items: ReturnType<typeof identifyServices>;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <Badge tone={tone}>{title}</Badge>
      </div>
      <ul className="space-y-2">
        {items.map((svc) => (
          <li key={svc.id} className="flex items-start justify-between gap-2 rounded-lg bg-raised p-3">
            <div className="min-w-0">
              <p className="text-sm text-fg">{svc.label}</p>
              <p className="text-xs text-muted">{svc.detail}</p>
              {svc.url ? (
                <a
                  href={svc.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-xs text-fdr hover:underline"
                >
                  Open <ExternalLink className="size-3" />
                </a>
              ) : null}
            </div>
            <Badge tone={statusTone(svc.status)}>
              {svc.status === "content"
                ? "Content"
                : svc.status === "none"
                  ? "None"
                  : svc.status === "direct"
                    ? "Direct"
                    : svc.status === "partner"
                      ? "Partner"
                      : svc.status === "offered"
                        ? "Offered"
                        : "Licensed"}
            </Badge>
          </li>
        ))}
      </ul>
    </section>
  );
}

function StatesOverview() {
  const fdr = SERVICE_CATALOG.filter((s) => s.brand === "fdr");
  const achieve = SERVICE_CATALOG.filter((s) => s.brand === "achieve");
  const counts = {
    fdrDirect: statesData.notes.fdrDirect.length,
    fdrPartner: statesData.notes.fdrPartner.length,
    heloc: statesData.states.filter((s) => s.achieveHeloc === "offered").length,
    pl: statesData.states.filter((s) => s.achievePersonalLoan === "offered").length,
  };
  return (
    <aside className="flex h-full min-h-0 min-w-0 flex-col gap-4 overflow-y-auto p-4">
      <header>
        <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-subtle">State services</p>
        <h2 className="mt-1 font-display text-xl leading-tight text-fg text-balance">
          Both brands, 51 jurisdictions
        </h2>
        <p className="mt-1 text-sm text-muted">
          Click a state to see what each brand can actually sell there.
        </p>
      </header>
      <section>
        <Badge tone="fdr">Freedom Debt Relief</Badge>
        <ul className="mt-2 space-y-2">
          {fdr.map((s) => (
            <li key={s.id} className="rounded-lg bg-raised p-3">
              <p className="text-sm text-fg">{s.label}</p>
              <p className="text-xs text-muted">{s.entity}</p>
              <p className="mt-1 font-mono text-xs text-subtle">
                {s.id === "settlement"
                  ? `${counts.fdrDirect} direct · ${counts.fdrPartner} partner`
                  : "Local SEO landings, not a separate product"}
              </p>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <Badge tone="achieve">Achieve</Badge>
        <ul className="mt-2 space-y-2">
          {achieve.map((s) => (
            <li key={s.id} className="rounded-lg bg-raised p-3">
              <p className="text-sm text-fg">{s.label}</p>
              <p className="text-xs text-muted">{s.entity}</p>
              <p className="mt-1 font-mono text-xs text-subtle">
                {s.id === "heloc" || s.id === "hel"
                  ? `${counts.heloc} states offered`
                  : s.id === "personal-loan"
                    ? `${counts.pl} states offered`
                    : s.id === "debt-relief"
                      ? "Same footprint as FDR settlement"
                      : "Where a collection license is on file"}
              </p>
            </li>
          ))}
        </ul>
      </section>
      <p className="text-[10px] text-subtle">{statesData.notes.achieveHelocClaim}</p>
    </aside>
  );
}
