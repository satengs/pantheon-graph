/**
 * The ONE place Evidence tag text is produced. Canvas tags, the legend and the tooltip all call
 * `evidenceLabel`. Pure (no React / data imports) so it can be unit-tested with node --test.
 *
 * Severity is normalised here: anything that is not critical/high/medium/low — "unrated", the
 * legacy "unknown" key from evidence.json before the rename, a missing field, or junk — counts as
 * unrated. So a stale cached evidence.json can never print "unknown" or "undefined".
 */
export type RatedSeverity = "critical" | "high" | "medium" | "low";
export type NormSeverity = RatedSeverity | "unrated";

const RATED: readonly RatedSeverity[] = ["critical", "high", "medium", "low"];
const SHORT: Record<RatedSeverity, string> = { critical: "crit", high: "high", medium: "med", low: "low" };

export function normSeverity(s: unknown): NormSeverity {
  return typeof s === "string" && (RATED as readonly string[]).includes(s) ? (s as RatedSeverity) : "unrated";
}

export type EvidenceLabel = {
  /** Total Evidence Brief rows in the roll-up. */
  count: number;
  /** Worst rated severity and how many rows carry it; null when no row is rated. */
  worst: { sev: RatedSeverity; n: number } | null;
  /** Rows with no rating (incl. legacy / missing keys). */
  unrated: number;
  /** "Evidence 84 · 4 critical" / "Evidence 22 · unrated" */
  full: string;
  /** Compact lines for small nodes: ["5"] (none rated) or ["3", "1 crit"]. */
  compact: string[];
};

/** Returns null for no rows: callers render nothing rather than a partial tag. */
export function evidenceLabel(items: ReadonlyArray<{ severity?: unknown }> | null | undefined): EvidenceLabel | null {
  if (!items || items.length === 0) return null;
  const sevs = items.map((i) => normSeverity(i?.severity));
  const count = sevs.length;
  const unrated = sevs.filter((s) => s === "unrated").length;
  let worst: EvidenceLabel["worst"] = null;
  for (const sev of RATED) {
    const n = sevs.filter((s) => s === sev).length;
    if (n) {
      worst = { sev, n };
      break;
    }
  }
  const full = `Evidence ${count} · ${worst ? `${worst.n} ${worst.sev}` : "unrated"}`;
  const compact = worst ? [String(count), `${worst.n} ${SHORT[worst.sev]}`] : [String(count)];
  return { count, worst, unrated, full, compact };
}
