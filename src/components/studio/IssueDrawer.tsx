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
  type FindingLike,
  type HistoryLike,
  type IssueListRow,
} from "@/lib/studio/issue-detail";
import { issueFitsFamily } from "@/lib/org/catalog";
import { isHiddenUiCode } from "@/lib/studio/query";
import { useStudio } from "@/store/studio";
import { sectionHint, textFragmentUrl } from "@/lib/studio/text-fragment";

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
  const finding = selectedFindingId ? findings.find((f) => f.id === selectedFindingId) ?? null : null;

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
      className="drawer-in fixed inset-y-0 right-0 z-[70] flex h-full w-[min(720px,100vw)] max-w-full flex-col border-l border-border bg-surface shadow-[var(--shadow-border)]"
    >
      <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-3">
        <div className="min-w-0">
          <p className="vh-kicker">Page</p>
          <h2 id={titleId} className="vh-page-hero mt-1">
            {view?.page.path || "No live URL"}
          </h2>
          <p className="vh-whisper mt-1">Section · {view?.section || PAGE_LEVEL}</p>
        </div>
        <Button type="button" variant="ghost" size="icon" onClick={close} aria-label="Close">
          <X />
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        {view ? (
          <>
            <div className="mb-5 flex flex-col gap-4">
              <Badge tone={view.gate.blocks ? "danger" : "ok"}>{view.gate.label}</Badge>
              <section>
                <p className="vh-kicker">Fix</p>
                <p className="vh-fix mt-1">{view.fix}</p>
              </section>
              <section>
                <p className="vh-kicker">What</p>
                <p className="vh-what mt-1">{view.what}</p>
              </section>
              <section>
                <p className="vh-kicker">Why</p>
                <p className="text-sm text-muted text-pretty mt-1">{view.why}</p>
              </section>
            </div>
            <ProofPairs code={issue?.code ?? finding?.code} />
            <IssueDetailBody view={view} />
          </>
        ) : (
          <p className="text-sm text-muted">Nothing selected.</p>
        )}
      </div>
    </aside>
  );

  return createPortal(panel, document.body);
}

function IssueDetailBody({ view }: { view: NonNullable<ReturnType<typeof formatIssueDetail>> }) {
  const quotes = view.evidence.quotes;
  const rows = view.evidence.proofRows.filter((row) => row.url && !quotes.some((c) => c.url === row.url));
  const primary = quotes[0]?.url || view.page.url;
  const primaryQuote = quotes[0]?.quote || "";
  const live = textFragmentUrl(primary, primaryQuote);

  return (
    <div className="flex flex-col gap-5">
      {primary ? (
        <section>
          <p className="vh-kicker">{sectionHint(quotes[0]?.location || view.section)}</p>
          {primaryQuote ? (
            <p className="mt-2 text-base leading-relaxed text-fg text-pretty">
              <mark className="ev-mark">{primaryQuote}</mark>
            </p>
          ) : null}
          <EvidenceShot url={primary} label={primaryQuote || view.page.path} />
          <iframe
            title="Live page at this passage"
            src={live}
            className="mt-2 h-[380px] w-full rounded-md bg-bg shadow-[var(--shadow-border)]"
          />
          <a
            href={live}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1 font-mono text-[11px] text-fdr hover:underline"
          >
            Open at this passage <ExternalLink className="size-3" />
          </a>
        </section>
      ) : null}

      {quotes.slice(1).map((c) => {
        const href = textFragmentUrl(c.url, c.quote);
        return (
          <section key={c.url + c.location}>
            <p className="vh-kicker">{sectionHint(c.location)}</p>
            <p className="mt-2 text-sm leading-relaxed text-fg text-pretty">
              <mark className="ev-mark">{c.quote}</mark>
            </p>
            {c.url !== primary ? <EvidenceShot url={c.url} label={c.quote} /> : null}
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1 font-mono text-[11px] text-muted hover:text-fg"
            >
              {c.url.replace(/^https?:\/\//, "")} <ExternalLink className="size-3" />
            </a>
          </section>
        );
      })}

      {view.evidence.found || view.evidence.suggested ? (
        <section>
          <p className="vh-kicker">Found vs suggested</p>
          <FoundSuggested found={view.evidence.found} suggested={view.evidence.suggested} />
        </section>
      ) : null}

      {rows.map((row) => (
        <section key={row.url + row.h1}>
          <p className="vh-kicker">
            {row.brand} · {row.h1 || "captured page"}
          </p>
          <EvidenceShot url={row.url} label={row.h1 || row.url} />
          {row.extra ? <p className="mt-1 text-xs text-muted">{row.extra}</p> : null}
          <a href={row.url} target="_blank" rel="noreferrer" className="mt-1 inline-flex font-mono text-[11px] text-muted hover:underline">
            {row.url.replace(/^https?:\/\//, "")}
          </a>
        </section>
      ))}

      {!quotes.length && !rows.length && !primary ? (
        <p className="text-sm text-muted">No captured evidence for this issue yet.</p>
      ) : null}
    </div>
  );
}

function ProofPairs({ code }: { code?: string }) {
  const proof = code ? ISSUE_PROOFS[code] : undefined;
  if (!proof) return null;
  const pairs = proof.pairs ?? [];
  const r = proof.redirected;
  const redirected = r ? (crawl.redirected ?? []).filter((x) => x.b === r.brand && x.path.includes(r.pathIncludes)) : [];
  const residual = proof.residual ?? [];
  if (!pairs.length && !redirected.length && !residual.length) return null;
  const short = (u: string) => u.replace(/^https?:\/\/(www\.)?/, "");
  return (
    <div className="mb-5 flex flex-col gap-4">
      {residual.length ? (
        <section>
          <p className="vh-kicker">Left to fix · {residual.length} items</p>
          <ol className="mt-2 flex flex-col gap-2">
            {residual.map((x, i) => (
              <li key={x.url} className="rounded-md bg-raised px-3 py-2">
                <a href={x.url} target="_blank" rel="noreferrer" className="block break-all font-mono text-[11px] text-fg hover:underline">
                  {i + 1}. {short(x.url)}
                </a>
                <p className="mt-1 text-xs text-fg text-pretty">{x.problem}</p>
                <p className="mt-1 text-xs text-muted text-pretty">
                  Fix: {x.fix} · Owner: {x.owner}
                </p>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
      {pairs.length ? (
        <section>
          <p className="vh-kicker">Still competing · {pairs.length} FDR vs Achieve pairs</p>
          <ol className="mt-2 flex flex-col gap-2">
            {pairs.map((p, i) => (
              <li key={p.achieve} className="rounded-md bg-raised px-3 py-2">
                <p className="text-xs font-medium text-fg">
                  {i + 1}. {p.query}
                </p>
                <a href={p.fdr} target="_blank" rel="noreferrer" className="mt-1 block break-all font-mono text-[11px] text-muted hover:underline">
                  FDR · {short(p.fdr)}
                </a>
                <a href={p.achieve} target="_blank" rel="noreferrer" className="block break-all font-mono text-[11px] text-muted hover:underline">
                  Achieve · {short(p.achieve)}
                </a>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
      {redirected.length ? (
        <section>
          <p className="vh-kicker">
            Resolved by redirect · {redirected.length} debt-relief URLs (of {(crawl.redirected ?? []).filter((x) => x.b === r?.brand).length} {r?.brand === "fdr" ? "FDR" : "Achieve"} redirects/404s), not counted as conflicts
          </p>
          <ul className="mt-2 flex flex-col gap-1">
            {redirected.map((x) => (
              <li key={x.path} className="font-mono text-[11px] text-muted">
                {x.path} → {x.status >= 400 ? x.status : short(x.to)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function EvidenceShot({ url, label }: { url: string; label?: string }) {
  if (!url.startsWith("http")) return null;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="mt-2 block overflow-hidden rounded-md bg-raised">
      <img
        src={`https://s.wordpress.com/mshots/v1/${encodeURIComponent(url)}?w=960`}
        alt={label || url}
        className="h-44 w-full object-cover object-top"
      />
    </a>
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
  categoryLabel,
}: {
  row: IssueListRow;
  selected?: boolean;
  onOpen: () => void;
  onHover?: (on: boolean) => void;
  leading?: ReactNode;
  categoryLabel?: string | null;
}) {
  const ink = "#1c1814";
  return (
    <div
      role="button"
      tabIndex={0}
      aria-current={selected ? "true" : undefined}
      style={
        selected
          ? { borderLeft: "3px solid #a89880", background: "#c4b8a4", color: ink }
          : { borderLeft: "3px solid transparent" }
      }
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
      className={`flex h-full min-h-0 cursor-pointer items-start gap-3 border-t border-border/80 px-3 text-left ${
        selected
          ? "border-l-[3px] border-l-[#a89880] bg-[#c4b8a4] py-3"
          : "border-l-[3px] border-l-transparent py-2 hover:bg-raised/50"
      }`}
    >
      {leading}
      <span
        className={`mt-1.5 size-1.5 shrink-0 rounded-full ${
          selected
            ? "bg-[#3a3530]"
            : row.impact === "critical"
              ? "bg-danger"
              : row.impact === "high"
                ? "bg-warn"
                : "bg-subtle"
        }`}
        title={row.impact || "impact"}
      />
      <div className="min-w-0 flex-1">
        <p className={`truncate font-mono text-[11px] ${selected ? "" : "text-fg"}`} style={selected ? { color: ink } : undefined}>
          {row.code}
          {categoryLabel ? <span className={selected ? "" : "text-muted"}> · {categoryLabel}</span> : null}
        </p>
        <p className={`mt-0.5 truncate font-mono text-xs ${selected ? "" : "text-muted"}`} style={selected ? { color: ink } : undefined}>
          <span className={`font-medium uppercase tracking-wide ${selected ? "" : "text-subtle"}`} style={selected ? { color: ink } : undefined}>Page </span>
          {row.pagePath}
        </p>
        <p className={`mt-0.5 truncate text-xs ${selected ? "" : "text-muted"}`} style={selected ? { color: ink } : undefined}>
          <span className={`font-medium uppercase tracking-wide ${selected ? "" : "text-subtle"}`} style={selected ? { color: ink } : undefined}>Section </span>
          {row.section || PAGE_LEVEL}
        </p>
        <p className={`mt-1 text-pretty ${selected ? "text-base font-medium" : "text-sm text-muted"}`} style={selected ? { color: ink } : undefined}>{row.what}</p>
        {selected && row.relatedPath ? (
          <p className="mt-1 truncate text-xs" style={{ color: ink }}>Related · {row.relatedPath}</p>
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
