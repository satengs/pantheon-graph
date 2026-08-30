import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RULES } from "@/data/rules-seed";
import { ISSUE_PROOFS } from "@/data/issue-proofs";
import { crawl } from "@/data/crawl";
import { listStudio } from "@/lib/server/studio-db";
import { jsonLdDiff } from "@/lib/html/json-diff";
import {
  PAGE_LEVEL,
  formatIssueDetail,
  formatIssueListRow,
  hasEvidence,
  type FindingLike,
  type HistoryLike,
  type IssueListRow,
} from "@/lib/studio/issue-detail";
import { issueFitsFamily } from "@/lib/org/catalog";
import { isHiddenUiCode } from "@/lib/studio/query";
import { PageMeta } from "@/components/studio/PageMeta";
import { useStudio } from "@/store/studio";

export function IssueDrawer() {
  const open = useStudio((s) => s.issueDrawerOpen);
  const close = useStudio((s) => s.closeIssueDrawer);
  const selectedIssueId = useStudio((s) => s.selectedIssueId);
  const selectedFindingId = useStudio((s) => s.selectedFindingId);
  const drawerPageUrl = useStudio((s) => s.drawerPageUrl);
  const attachedRuleCodes = useStudio((s) => s.attachedRuleCodes);
  const graphOrg = useStudio((s) => s.graphOrg);
  const parentSlug = useStudio((s) => s.parentSlug);
  const titleId = useId();
  const [ready, setReady] = useState(false);
  const [findings, setFindings] = useState<FindingLike[]>([]);
  const [history, setHistory] = useState<HistoryLike[]>([]);

  useEffect(() => setReady(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  useEffect(() => {
    if (!open) return;
    void listStudio()
      .then((d) => {
        setFindings(d.findings);
        setHistory(d.history);
      })
      .catch(() => {
        setFindings([]);
        setHistory([]);
      });
  }, [open, selectedIssueId, selectedFindingId]);

  const rawIssue =
    RULES.find((i) => i.id === selectedIssueId && (!attachedRuleCodes.length || attachedRuleCodes.includes(i.code))) ??
    null;
  const issue = rawIssue && !isHiddenUiCode(rawIssue.code) && issueFitsFamily(rawIssue, graphOrg, parentSlug) ? rawIssue : null;
  const finding =
    findings.find((f) => f.id === selectedFindingId) ??
    (issue ? findings.find((f) => f.url === issue.urls[0] || f.code === issue.code) : undefined) ??
    null;

  const view = useMemo(
    () =>
      formatIssueDetail({
        issue,
        finding,
        pageUrl: drawerPageUrl,
        proof: issue ? ISSUE_PROOFS[issue.code] : finding ? ISSUE_PROOFS[finding.code] : undefined,
        crawlAt: crawl.crawledAt,
        history,
        org: graphOrg,
      }),
    [issue, finding, history, graphOrg, drawerPageUrl],
  );

  if (!ready || !open) return null;

  const panel = (
    <aside
      role="dialog"
      aria-labelledby={titleId}
      className="drawer-in fixed inset-y-0 right-0 z-[70] flex h-full w-[min(520px,100vw)] max-w-full flex-col border-l border-border bg-surface shadow-[var(--shadow-border)]"
    >
      <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-3">
        <div className="min-w-0">
          <p className="vh-kicker">Issue on</p>
          <h2 id={titleId} className="vh-page mt-1">
            {view?.page.path || "No live URL"}
          </h2>
          <p className="vh-what mt-1">
            {view?.section || PAGE_LEVEL}
            {view?.what ? ` · ${view.what}` : ""}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {view?.gate ? (
              <Badge tone={view.gate.blocks ? "danger" : "ok"}>{view.gate.label}</Badge>
            ) : null}
            {view?.code ? <Badge>{view.code}</Badge> : null}
            {view?.impact ? (
              <Badge tone={view.impact === "critical" ? "danger" : view.impact === "high" ? "warn" : "neutral"}>
                {view.impact}
              </Badge>
            ) : null}
          </div>
        </div>
        <Button type="button" variant="ghost" size="icon" onClick={close} aria-label="Close">
          <X />
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        {view ? <IssueDetailBody view={view} /> : <p className="text-sm text-muted">Nothing selected.</p>}
      </div>
    </aside>
  );

  return createPortal(panel, document.body);
}

function IssueDetailBody({ view }: { view: NonNullable<ReturnType<typeof formatIssueDetail>> }) {
  const related = view.relatedPages.filter((p) => p.url);
  const fixPage = view.fixPage.url ? view.fixPage : view.page.url ? view.page : null;
  return (
    <div className="flex flex-col gap-4">
      <section className="g-figure">
        <p className="vh-kicker">Fix on this page</p>
        {fixPage ? (
          <a href={fixPage.url} target="_blank" rel="noreferrer" className="vh-page mt-1 block hover:underline">
            {fixPage.path}
          </a>
        ) : null}
        <p className="vh-fix mt-2">{view.fix || "—"}</p>
      </section>

      {related.length ? (
        <section className="g-ground">
          <p className="vh-kicker">Related — do not edit</p>
          <ul className="mt-1 space-y-1">
            {related.map((p) => (
              <li key={p.url}>
                <a href={p.url} target="_blank" rel="noreferrer" className="vh-whisper block font-mono hover:text-muted hover:underline">
                  {p.path}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h3 className="text-[11px] font-medium uppercase tracking-wide text-subtle">Why</h3>
        <p className="mt-1 text-base leading-relaxed text-muted text-pretty">{view.why || "—"}</p>
      </section>

      <PageMeta url={view.page.url} variant="drawer" />

      {hasEvidence(view) ? (
        <section className="rounded-lg bg-raised p-3">
          <h3 className="text-[11px] font-medium uppercase tracking-wide text-subtle">Evidence</h3>
          {view.evidence.proofConflict ? (
            <p className="mt-2 text-sm text-danger text-pretty">{view.evidence.proofConflict}</p>
          ) : null}
          {view.evidence.quotes.map((c) => (
            <blockquote key={c.url + c.location} className="mt-3 rounded-md bg-bg p-3">
              <div className="flex items-center justify-between gap-2">
                {c.brand ? (
                  <Badge tone={c.brand === "fdr" ? "fdr" : c.brand === "achieve" ? "achieve" : "neutral"}>{c.brand}</Badge>
                ) : null}
                <span className="text-[10px] uppercase tracking-wide text-subtle">{c.location || PAGE_LEVEL}</span>
              </div>
              <p className="mt-2 text-sm text-fg text-pretty">“{c.quote}”</p>
              {c.whyReal ? <p className="mt-1 text-xs text-muted text-pretty">{c.whyReal}</p> : null}
              {c.url ? (
                <a
                  href={c.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex items-center gap-1 font-mono text-[11px] text-fdr hover:underline"
                >
                  {c.url.replace(/^https?:\/\//, "")} <ExternalLink className="size-3" />
                </a>
              ) : null}
            </blockquote>
          ))}
          {view.evidence.found || view.evidence.suggested ? (
            <div className="mt-3">
              <p className="text-[10px] uppercase tracking-wide text-subtle">Found vs suggested</p>
              <FoundSuggested found={view.evidence.found} suggested={view.evidence.suggested} />
            </div>
          ) : null}
          {view.evidence.proofRows.length ? (
            <ul className="mt-3 space-y-2">
              {view.evidence.proofRows.map((row) => (
                <li key={row.url + row.h1} className="rounded-md bg-bg p-2">
                  <div className="flex items-center gap-2">
                    <Badge tone={row.brand === "fdr" ? "fdr" : row.brand === "achieve" ? "achieve" : "neutral"}>
                      {row.brand}
                    </Badge>
                  </div>
                  {row.h1 ? <p className="mt-1 text-sm text-fg">{row.h1}</p> : null}
                  <p className="mt-1 font-mono text-[10px] text-muted">
                    canonical → {row.canonical.replace(/^https:\/\//, "") || "(none)"}
                  </p>
                  {row.extra ? <p className="mt-1 text-[10px] text-subtle">{row.extra}</p> : null}
                  <a
                    href={row.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-flex font-mono text-[10px] text-fdr hover:underline"
                  >
                    {row.url.replace(/^https:\/\//, "")}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {view.history.length ? (
        <section>
          <h3 className="text-[11px] font-medium uppercase tracking-wide text-subtle">History</h3>
          <ul className="mt-2 space-y-2">
            {view.history.map((h, i) => (
              <li key={`${h.kind}:${h.when}:${i}`} className="rounded-lg bg-raised px-3 py-2">
                <p className="text-sm text-fg">{h.label}</p>
                <p className="font-mono text-[11px] text-subtle">
                  {h.kind}
                  {h.when ? ` · ${h.when.replace("T", " ").replace("Z", " UTC")}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function FoundSuggested({ found, suggested }: { found: string; suggested: string }) {
  const lines = jsonLdDiff(found, suggested);
  return (
    <div className="mt-2 overflow-x-auto rounded-md bg-bg p-2 font-mono text-[11px] leading-relaxed">
      <p className="mb-1 text-[10px] uppercase tracking-wide text-subtle">JSON-LD / HTML diff · red gone · green add</p>
      {lines.map((l, i) => (
        <div key={`${l.op}-${i}`} className={l.op === "del" ? "text-danger" : l.op === "add" ? "text-ok" : "text-muted"}>
          {l.op === "del" ? "− " : l.op === "add" ? "+ " : "  "}
          {l.text || " "}
        </div>
      ))}
    </div>
  );
}

export function IssueRow({
  row,
  selected,
  onOpen,
  onHover,
  leading,
}: {
  row: IssueListRow;
  selected?: boolean;
  onOpen: () => void;
  onHover?: (on: boolean) => void;
  leading?: ReactNode;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-current={selected ? "true" : undefined}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
      className={`flex cursor-pointer items-start gap-3 border-t border-border/80 px-3 py-2.5 text-left hover:bg-raised/70 ${
        selected ? "g-rail" : ""
      }`}
    >
      {leading}
      <span
        className={`mt-2 size-2 shrink-0 rounded-full ${
          row.impact === "critical" ? "bg-danger" : row.impact === "high" ? "bg-warn" : "bg-subtle"
        }`}
        title={row.impact || "impact"}
      />
      <div className="min-w-0 flex-1">
        <div className="g-figure py-2">
          <p className="vh-page truncate">{row.pagePath}</p>
          <p className="vh-what mt-0.5">
            {row.section || PAGE_LEVEL}
            {row.what ? ` · ${row.what}` : ""}
          </p>
          <p className="vh-whisper mt-1">Fix this page</p>
        </div>
        {row.relatedPath ? (
          <div className="g-ground mt-1.5">
            <p className="vh-whisper truncate">Related · {row.relatedPath}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function issueRowFromRule(
  i: (typeof RULES)[number],
  org: ReturnType<typeof useStudio.getState>["graphOrg"],
): IssueListRow {
  const proof = ISSUE_PROOFS[i.code];
  return formatIssueListRow({
    id: i.id,
    code: i.code,
    kind: "rule",
    title: i.title,
    urls: i.urls,
    citations: i.citations,
    domain: i.domain,
    product: i.product,
    impact: i.impact,
    layer: i.layer,
    proofH1: proof?.rows[0]?.h1,
    org,
  });
}
