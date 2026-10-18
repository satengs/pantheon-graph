import { SEVERITIES, SEVERITY_COLOR, SEVERITY_GLYPH, SEVERITY_LABEL, type Severity } from "@/lib/graph/severity";
import type { SevTotals as Totals } from "@/lib/studio/issue-source";

/** Letter pill for one severity — never colour alone. */
export function SevPill({ impact, className = "" }: { impact: Severity; className?: string }) {
  return (
    <span
      className={`inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full px-1 text-[9px] font-bold text-[#0b0c0e] ${className}`}
      style={{ background: SEVERITY_COLOR[impact] }}
      title={SEVERITY_LABEL[impact]}
      data-sev-pill={impact}
    >
      {SEVERITY_GLYPH[impact]}
    </span>
  );
}

/** C/H/M/L totals from the single issue source (issue-source.ts). */
export function SevTotals({ totals, label, testId = "sev-totals" }: { totals: Totals; label?: string; testId?: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[11px] text-muted"
      data-testid={testId}
      data-c={totals.critical}
      data-h={totals.high}
      data-m={totals.medium}
      data-l={totals.low}
      aria-label={`${totals.critical} critical, ${totals.high} high, ${totals.medium} medium, ${totals.low} low open rules`}
    >
      {label ? <span className="text-[10px] uppercase tracking-wide text-subtle">{label}</span> : null}
      {SEVERITIES.map((s) => (
        <span key={s} className="inline-flex items-center gap-0.5">
          <SevPill impact={s} />
          <span className="font-mono text-fg">{totals[s]}</span>
        </span>
      ))}
    </span>
  );
}
