import { useEffect, useState } from "react";

import type { EvidenceItem, EvRollup } from "@/lib/graph/evidence";
import { EV_COLOR, EV_LABEL, EV_TAG_FILL, EV_TAG_STROKE } from "@/lib/graph/evidence";
import { FlagChips, NeutralChip, SourceChips, VerificationChip } from "@/components/studio/StatusChips";
import { isNewInLatestBrief } from "@/lib/graph/evidence-filter";
import { useStudio } from "@/store/studio";

/**
 * Evidence tag: neutral outline + hollow diamond, square corners. Never a filled severity pill, so a row
 * count can't be read as a C/H/M/L count. The rated severity (if any) is spelled out in words.
 */
export function EvTag({ text, title, className = "" }: { text: string; title?: string; className?: string }) {
  return (
    <span
      className={`inline-flex h-5 shrink-0 items-center gap-1 border px-1.5 font-mono text-[10px] leading-none ${className}`}
      style={{ borderColor: EV_TAG_STROKE, color: EV_TAG_STROKE, background: EV_TAG_FILL }}
      title={title}
      data-ev-tag
    >
      <EvDiamond />
      {text}
    </span>
  );
}

export function EvDiamond({ size = 7 }: { size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-block shrink-0 rotate-45 border-[1.5px]"
      style={{ width: size, height: size, borderColor: EV_TAG_STROKE }}
    />
  );
}

/** Per-row tag: "Unrated" or the rated severity in words (the word is tinted, the tag stays neutral). */
export function EvBadge({ item }: { item: Pick<EvidenceItem, "severity"> }) {
  return (
    <span
      className="inline-flex h-5 shrink-0 items-center gap-1 border px-1.5 text-[10px] font-medium leading-none"
      style={{ borderColor: EV_TAG_STROKE, background: EV_TAG_FILL, color: item.severity === "unrated" ? EV_TAG_STROKE : EV_COLOR[item.severity] }}
      title={`Evidence Brief row · ${EV_LABEL[item.severity]}`}
      data-ev-tag
    >
      <EvDiamond />
      {EV_LABEL[item.severity]}
    </span>
  );
}

function Lightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div
      role="dialog"
      aria-label={alt}
      data-testid="evidence-lightbox"
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 p-6"
      onClick={onClose}
    >
      <figure className="flex max-h-full w-full max-w-5xl flex-col items-center gap-2" onClick={(e) => e.stopPropagation()}>
        <img src={src} alt={alt} className="max-h-[82vh] max-w-full rounded-md object-contain shadow-2xl" />
        <figcaption className="flex w-full items-center justify-between gap-3 text-xs text-white/80">
          <span className="truncate font-mono">{alt}</span>
          <button type="button" className="rounded bg-white/10 px-2 py-1 hover:bg-white/20" onClick={onClose}>
            Close (Esc)
          </button>
        </figcaption>
      </figure>
    </div>
  );
}

export function EvidenceCard({
  item,
  defaultOpen = false,
  unmapped = false,
  selectable = false,
  asOf,
}: {
  item: EvidenceItem;
  defaultOpen?: boolean;
  /** Unmapped panel: show the row's URL(s) and what to do with it under the headline. */
  unmapped?: boolean;
  /** Issues list: click selects the row and fills the inspector with the same id. */
  selectable?: boolean;
  /** Newest brief date; rows first seen on this date get a NEW chip. */
  asOf?: string;
}) {
  const selectedEvidenceId = useStudio((s) => s.selectedEvidenceId);
  const selectEvidence = useStudio((s) => s.selectEvidence);
  const selected = selectable && selectedEvidenceId === item.id;
  const [open, setOpen] = useState(defaultOpen);
  const [shot, setShot] = useState<EvidenceItem["screenshots"][number] | null>(null);
  const label = item.id;
  const isNew = isNewInLatestBrief(item, asOf);
  const scope = evidenceScope(item);
  const verifyNote =
    item.verification === "to_verify"
      ? "Not counted in Gate until verified"
      : item.verification === "unverified"
        ? item.verificationNote || "unverified: needs Search Console or Cloudflare access"
        : item.verification === "confirmed" && item.verificationNote
          ? item.verificationNote
          : "";
  return (
    <article
      className={`min-w-0 rounded-lg p-2.5 shadow-[var(--shadow-border)] ${selected ? "" : "bg-surface"}`}
      data-evidence-id={item.id}
      data-evidence-severity={item.severity}
      data-evidence-verification={item.verification ?? "reported"}
      data-selected={selected ? "true" : undefined}
      data-testid={selected ? "evidence-row-selected" : undefined}
      // 3px cream left edge + lighter fill. Inset box-shadow (not border-left) so the
      // rounded-card + coloured-left-stripe style guard stays clean.
      style={
        selected
          ? {
              background: "color-mix(in oklab, var(--color-surface) 72%, #c4b8a4)",
              boxShadow: "inset 3px 0 0 0 #c4b8a4, var(--shadow-border)",
            }
          : undefined
      }
    >
      <button
        type="button"
        className="flex w-full items-start gap-2 text-left"
        onClick={() => {
          if (selectable) selectEvidence(item.id);
          setOpen((v) => (selectable && selected ? !v : true));
        }}
        aria-expanded={open}
        aria-current={selected ? "true" : undefined}
      >
        <EvBadge item={item} />
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] uppercase tracking-wide text-subtle">
            {label} · {item.status}
            {item.daysOpen != null ? ` · ${item.daysOpen}d open` : ""}
          </span>
          <span className="block text-sm leading-snug text-pretty text-fg [overflow-wrap:anywhere]">{item.title}</span>
        </span>
      </button>
      <div className="mt-1.5 flex flex-wrap items-center gap-1" data-testid="evidence-chips">
        {isNew ? (
          <NeutralChip title="New in the latest Evidence Brief" testId="new-chip">
            NEW
          </NeutralChip>
        ) : null}
        <SourceChips item={item} />
        <VerificationChip item={item} />
        <FlagChips item={item} />
      </div>
      <dl className="mt-1.5 grid grid-cols-[3.75rem_minmax(0,1fr)] items-start gap-x-2 gap-y-1 text-[11px] leading-snug" data-testid="evidence-summary">
        <dt className="text-subtle">{item.flags?.gap ? "Scope" : "Page"}</dt>
        <dd className="min-w-0 [overflow-wrap:anywhere] text-muted" data-testid="evidence-scope">
          {scope}
        </dd>
        <dt className="text-subtle">Problem</dt>
        <dd className="min-w-0 [overflow-wrap:anywhere] text-pretty text-fg">{item.title}</dd>
        <dt className="text-subtle">Why</dt>
        <dd className="min-w-0 [overflow-wrap:anywhere] text-pretty text-muted">
          {item.why || "No reason given in the source row"}
        </dd>
        <dt className="text-subtle">Fix</dt>
        <dd className="min-w-0 [overflow-wrap:anywhere] text-pretty text-fg">
          {item.fix || "No fix given in the source row"}
        </dd>
        <dt className="text-subtle">Owner</dt>
        <dd className="min-w-0 [overflow-wrap:anywhere] text-pretty text-muted">{item.owner || "No owner named"}</dd>
      </dl>
      {verifyNote ? (
        <p className="mt-1 text-[11px] text-subtle" data-testid="evidence-gate-note">
          {verifyNote}
        </p>
      ) : null}
      {unmapped ? (
        <div className="mt-1.5 flex flex-col gap-1 pl-1 text-[11px]" data-testid="unmapped-row-detail">
          {item.urls.length ? (
            <ul className="flex flex-col font-mono text-[10.5px] text-muted [overflow-wrap:anywhere]" data-testid="unmapped-urls">
              {item.urls.slice(0, 4).map((u) => (
                <li key={u}>{u.replace(/^https?:\/\//, "")}</li>
              ))}
              {item.urls.length > 4 ? <li className="font-sans text-subtle">+{item.urls.length - 4} more</li> : null}
            </ul>
          ) : (
            <p className="text-subtle">No URL in the brief row</p>
          )}
          <p className="text-subtle" data-testid="unmapped-hint">
            <span className="text-muted">Why unmapped: </span>
            {unmappedHint(item)}
          </p>
        </div>
      ) : null}
      {open ? (
        <div className="mt-2 flex flex-col gap-2 text-xs">
          <dl className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-2 gap-y-1 [overflow-wrap:anywhere]">
            <dt className="text-subtle">Severity</dt>
            <dd className="text-muted">
              {EV_LABEL[item.severity]} <span className="text-subtle">— {item.severityBasis}</span>
            </dd>
            <dt className="text-subtle">Status</dt>
            <dd className="text-muted">
              {item.statusText} <span className="text-subtle">(first {item.firstSeen}, last {item.lastSeen})</span>
            </dd>
            {item.firstReport ? (
              <>
                <dt className="text-subtle">First report</dt>
                <dd className="text-pretty text-subtle">{item.firstReport}</dd>
              </>
            ) : null}
            {item.urls.length ? (
              <>
                <dt className="text-subtle">URLs</dt>
                <dd className="flex flex-col font-mono text-[11px]">
                  {item.urls.map((u) => (
                    <a key={u} href={u} target="_blank" rel="noreferrer" className="truncate text-muted hover:text-fg">
                      {u.replace(/^https?:\/\//, "")}
                      {item.unmatchedUrls?.includes(u) || item.match.kind === "unmapped" ? (
                        <span className="ml-1 font-sans text-subtle">(not in crawl)</span>
                      ) : null}
                    </a>
                  ))}
                </dd>
              </>
            ) : null}
            {item.links.length ? (
              <>
                <dt className="text-subtle">Evidence</dt>
                <dd className="flex flex-col">
                  {item.links.slice(0, 6).map((u) => (
                    <a key={u} href={u} target="_blank" rel="noreferrer" className="truncate text-accent hover:underline">
                      {u.replace(/^https?:\/\//, "")}
                    </a>
                  ))}
                </dd>
              </>
            ) : null}
            <dt className="text-subtle">On graph</dt>
            <dd className="text-subtle" data-evidence-match={item.match.kind}>
              {item.match.kind === "page"
                ? item.match.drawn
                  ? "page node (and its hub + brand roll-ups)"
                  : "crawl page outside the product hubs → brand roll-up"
                : item.match.kind === "site-wide"
                  ? item.flags?.gap
                    ? `content gap → ${item.match.nodes.length} brand nodes (counted once in the family total)`
                    : item.flags?.cluster
                      ? "cluster issue → brand node (pages stay capped)"
                      : sharedAcrossBrands(item) ?? "site-wide → brand node"
                  : `unmapped — ${item.match.reason ?? "no graph node"}`}
            </dd>
            <dt className="text-subtle">Source</dt>
            <dd className="text-subtle">{item.refs.join(" · ")}</dd>
          </dl>
          {item.screenshots.length ? (
            <div className="flex flex-col gap-2" data-testid="evidence-shots">
              {item.screenshots.map((s) => (
                <button
                  key={s.file}
                  type="button"
                  className="flex min-w-0 flex-col overflow-hidden rounded-md bg-raised text-left shadow-[var(--shadow-border)] hover:ring-1 hover:ring-accent"
                  onClick={() => setShot(s)}
                  title={`${s.name} · ${s.pack} · click to enlarge`}
                >
                  <img
                    src={s.file}
                    alt={s.name}
                    loading="lazy"
                    data-testid="evidence-thumb"
                    className="h-40 w-full min-w-[200px] bg-bg object-contain object-top"
                  />
                  <span className="truncate px-2 py-1 font-mono text-[10px] text-subtle">{s.name}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      {shot ? <Lightbox src={shot.file} alt={`${shot.name} · ${shot.pack}`} onClose={() => setShot(null)} /> : null}
    </article>
  );
}

export function EvidenceList({ roll, emptyText }: { roll: EvRollup | null; emptyText?: string }) {
  if (!roll) return <p className="text-xs text-subtle">{emptyText ?? "No Evidence Brief rows here."}</p>;
  return (
    <div className="flex flex-col gap-1.5" data-testid="evidence-list">
      {roll.items.map((i, n) => (
        <EvidenceCard key={i.id} item={i} defaultOpen={n === 0} />
      ))}
    </div>
  );
}

/** What to do with a row that has no graph node. Text only; mapping happens in the crawl, not here. */
export function unmappedHint(item: EvidenceItem): string {
  if (item.match?.reason) return item.match.reason;
  if (!item.urls.length) return "no URL in brief";
  const hosts = item.urls.map((u) => {
    try {
      return new URL(u).hostname;
    } catch {
      return "";
    }
  });
  const sub = hosts.some((h) => h && !h.startsWith("www."));
  return sub ? "off-site ad host" : "own URL not in crawl (404, off-sitemap or vanity)";
}

const SHORT_BRAND: Record<string, string> = { fdr: "FDR", achieve: "Achieve", bills: "Bills" };

/** Site-wide rows on more than one brand node: show the share and that they count once. */
export function sharedAcrossBrands(item: Pick<EvidenceItem, "match" | "scope">): string | null {
  if (item.scope && /shared across/i.test(item.scope)) return item.scope;
  const brands = (item.match?.nodes ?? [])
    .filter((n) => n.startsWith("brand:"))
    .map((n) => SHORT_BRAND[n.slice(6)] ?? n.slice(6));
  if (brands.length < 2) return item.match?.reason && /shared across/i.test(item.match.reason) ? item.match.reason : null;
  const list = brands.length === 2 ? `${brands[0]} and ${brands[1]}` : `${brands.slice(0, -1).join(", ")} and ${brands[brands.length - 1]}`;
  return `Shared across ${list}; counted once at the parent`;
}

/** Page or scope line for an evidence row. Gaps never show a URL. */
export function evidenceScope(item: Pick<EvidenceItem, "urls" | "flags" | "scope" | "match" | "brand">): string {
  if (item.flags?.gap) return item.scope || "gap, no page";
  const shared = sharedAcrossBrands(item);
  if (shared) return shared;
  if (item.scope) return item.scope;
  const u = item.urls[0];
  if (u) return u.replace(/^https?:\/\//, "");
  if (item.match.kind === "site-wide") return `site-wide · ${item.brand}`;
  return "no page named";
}

