import { useEffect, useState } from "react";

import type { EvidenceItem, EvRollup } from "@/lib/graph/evidence";
import { EV_COLOR, EV_GLYPH, EV_LABEL } from "@/lib/graph/evidence";

/** Square badge = Evidence Brief (Pantheon rule badges are round pills). */
export function EvBadge({ item }: { item: Pick<EvidenceItem, "severity"> }) {
  return (
    <span
      className="inline-flex h-4 min-w-6 items-center justify-center rounded-[3px] px-1 text-[9px] font-bold text-[#0b0c0e]"
      style={{ background: EV_COLOR[item.severity] }}
      title={`Evidence Brief · ${EV_LABEL[item.severity]}`}
    >
      E{EV_GLYPH[item.severity]}
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
      <figure className="flex max-h-full max-w-5xl flex-col gap-2" onClick={(e) => e.stopPropagation()}>
        <img src={src} alt={alt} className="max-h-[82vh] w-auto rounded-md object-contain shadow-2xl" />
        <figcaption className="flex items-center justify-between gap-3 text-xs text-white/80">
          <span className="truncate font-mono">{alt}</span>
          <button type="button" className="rounded bg-white/10 px-2 py-1 hover:bg-white/20" onClick={onClose}>
            Close (Esc)
          </button>
        </figcaption>
      </figure>
    </div>
  );
}

export function EvidenceCard({ item, defaultOpen = false }: { item: EvidenceItem; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [shot, setShot] = useState<EvidenceItem["screenshots"][number] | null>(null);
  const label = item.source === "brief" ? `Row ${item.row}` : `NDR vs FDR ${item.id}`;
  return (
    <article
      className="min-w-0 rounded-lg bg-surface p-2.5 shadow-[var(--shadow-border)]"
      data-evidence-id={item.id}
      data-evidence-severity={item.severity}
    >
      <button type="button" className="flex w-full items-start gap-2 text-left" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <EvBadge item={item} />
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] uppercase tracking-wide text-subtle">
            {label} · {item.owner} · {item.status}
            {item.daysOpen != null ? ` · ${item.daysOpen}d open` : ""}
          </span>
          <span className="block text-sm leading-snug text-fg">{item.title}</span>
        </span>
      </button>
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
            {item.why ? (
              <>
                <dt className="text-subtle">Why</dt>
                <dd className="text-pretty text-muted">{item.why}</dd>
              </>
            ) : null}
            {item.fix ? (
              <>
                <dt className="text-subtle">Fix</dt>
                <dd className="text-pretty text-fg">{item.fix}</dd>
              </>
            ) : null}
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
                  ? "site-wide → brand node"
                  : `unmapped — ${item.match.reason ?? "no graph node"}`}
            </dd>
            <dt className="text-subtle">Source</dt>
            <dd className="text-subtle">{item.refs.join(" · ")}</dd>
          </dl>
          {item.screenshots.length ? (
            <div className="grid grid-cols-3 gap-1.5" data-testid="evidence-shots">
              {item.screenshots.map((s) => (
                <button
                  key={s.file}
                  type="button"
                  className="overflow-hidden rounded-md bg-raised shadow-[var(--shadow-border)] hover:ring-1 hover:ring-accent"
                  onClick={() => setShot(s)}
                  title={`${s.name} · ${s.pack}`}
                >
                  <img src={s.file} alt={s.name} loading="lazy" className="h-16 w-full object-cover object-top" />
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
