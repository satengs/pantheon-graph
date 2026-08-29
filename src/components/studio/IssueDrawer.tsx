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
import { useStudio } from "@/store/studio";

export function IssueDrawer() {
  const open = useStudio((s) => s.issueDrawerOpen);
  const close = useStudio((s) => s.closeIssueDrawer);
  const selectedIssueId = useStudio((s) => s.selectedIssueId);
  const selectedFindingId = useStudio((s) => s.selectedFindingId);
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
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
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
  const issue = rawIssue && issueFitsFamily(rawIssue, graphOrg, parentSlug) ? rawIssue : null;
  const finding = findings.find((f) => f.id === selectedFindingId) ?? null;

  const view = useMemo(
    () =>
      formatIssueDetail({
        issue,
        finding: issue ? null : finding,
        proof: issue ? ISSUE_PROOFS[issue.code] : finding ? ISSUE_PROOFS[finding.code] : undefined,
        crawlAt: crawl.crawledAt,
        history,
        org: graphOrg,
      }),
    [issue, finding, history, graphOrg],
  );

  if (!ready || !open) return null;

  const panel = (
    <div className="fixed inset-0 z-[70]" role="presentation">
      <button type="button" aria-label="Close issue" className="absolute inset-0 bg-bg/80" onClick={close} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="drawer-in absolute inset-y-0 right-0 flex h-full w-[min(520px,100vw)] max-w-full flex-col bg-surface shadow-[var(--shadow-border)]"
      >
        <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-subtle">View the issue</p>
            <h2 id={titleId} className="mt-1 font-display text-2xl leading-tight text-fg text-balance">
              {view?.what || "Issue"}
            </h2>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {view?.gate ? (
                <Badge tone={view.gate.blocks ? "danger" : "ok"}>{view.gate.label}</Badge>
              ) : null}
              {view?.code ? <Badge>{view.code}</Badge> : null}
              {view?.layer ? <Badge>{view.layer}</Badge> : null}
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
    </div>
  );

  return createPortal(panel, document.body);
}

function IssueDetailBody({ view }: { view: NonNullable<ReturnType<typeof formatIssueDetail>> }) {
  const pages = view.pages.length ? view.pages : view.page.url ? [view.page] : [];
  return (
    <div className="flex flex-col gap-6">
      <section>
        <h3 className="text-[11px] font-medium uppercase tracking-wide text-subtle">Page</h3>
        {pages.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No live URL</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {pages.map((p) => (
              <li key={p.url} className="rounded-lg bg-raised p-3">
                {p.url ? (
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex max-w-full items-center gap-1.5 font-mono text-sm text-fg hover:underline"
                  >
                    <span className="truncate">{p.path}</span>
                    <ExternalLink className="size-3.5 shrink-0 text-muted" />
                  </a>
                ) : (
                  <p className="font-mono text-sm text-muted">{p.path}</p>
                )}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {p.brandLabel ? (
                    <Badge tone={p.brand === "fdr" ? "fdr" : p.brand === "achieve" ? "achieve" : "neutral"}>
                      {p.brandLabel}
                    </Badge>
                  ) : null}
                  {p.productLabel ? <Badge>{p.productLabel}</Badge> : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="text-[11px] font-medium uppercase tracking-wide text-subtle">Section</h3>
        <p className="mt-1 text-base leading-relaxed text-fg">{view.section || PAGE_LEVEL}</p>
      </section>

      <section>
        <h3 className="text-[11px] font-medium uppercase tracking-wide text-subtle">What</h3>
        <p className="mt-1 text-base leading-relaxed text-fg text-pretty">{view.what}</p>
      </section>

      <section>
        <h3 className="text-[11px] font-medium uppercase tracking-wide text-subtle">Why</h3>
        <p className="mt-1 text-base leading-relaxed text-muted text-pretty">{view.why || "—"}</p>
      </section>

      <section>
        <h3 className="text-[11px] font-medium uppercase tracking-wide text-subtle">Fix</h3>
        <p className="mt-1 text-base leading-relaxed text-fg text-pretty">{view.fix || "—"}</p>
      </section>

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
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
      className={`flex cursor-pointer items-start gap-3 border-t border-border/80 px-3 py-3 text-left hover:bg-raised/70 ${
        selected ? "bg-raised" : ""
      }`}
    >
      {leading}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-block max-w-full truncate rounded-md bg-accent/12 px-2 py-1 font-mono text-sm text-fg shadow-[var(--shadow-border)]">
            {row.pagePath}
          </span>
          {row.brandLabel ? (
            <Badge tone={row.brand === "fdr" ? "fdr" : row.brand === "achieve" ? "achieve" : "neutral"}>
              {row.brandLabel}
            </Badge>
          ) : null}
          <span className="text-[11px] text-muted">{row.section || PAGE_LEVEL}</span>
        </div>
        <p className="mt-1.5 text-sm text-fg text-pretty">{row.what}</p>
        <p className="mt-0.5 font-mono text-[10px] text-subtle">
          {row.code}
          {row.layer ? ` · ${row.layer}` : ""}
          {row.productLabel ? ` · ${row.productLabel}` : ""}
        </p>
      </div>
      {row.impact ? (
        <Badge tone={row.impact === "critical" ? "danger" : row.impact === "high" ? "warn" : "neutral"}>{row.impact}</Badge>
      ) : null}
      <Button
        size="sm"
        variant="secondary"
        onClick={(e) => {
          e.stopPropagation();
          onOpen();
        }}
      >
        View issue
      </Button>
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
