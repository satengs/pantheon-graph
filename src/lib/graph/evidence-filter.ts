import type { EvidenceItem, EvRollup, SourceFilter } from "@/lib/graph/evidence";

/** Chips in the source bar. "both" stays the All id so existing e2e selectors keep working. */
export const SOURCE_FILTERS: { id: SourceFilter; label: string }[] = [
  { id: "both", label: "All" },
  { id: "pantheon", label: "Pantheon" },
  { id: "evidence-brief", label: "Evidence Brief" },
  { id: "funnel-fix", label: "Funnel Fix" },
  { id: "scout", label: "Scout" },
];

export function showsPantheon(s: SourceFilter): boolean {
  return s === "pantheon" || s === "both";
}

export function showsEvidence(s: SourceFilter): boolean {
  return s !== "pantheon";
}

export function itemSources(it: Pick<EvidenceItem, "source" | "sources" | "confirmations">): Array<"evidence-brief" | "scout"> {
  if (it.sources?.length) return it.sources.filter((s): s is "evidence-brief" | "scout" => s === "evidence-brief" || s === "scout");
  if (it.source === "scout") return ["scout"];
  return ["evidence-brief"];
}

export function evidenceMatchesSource(it: EvidenceItem, s: SourceFilter): boolean {
  if (s === "pantheon") return false;
  if (s === "both" || s === "evidence") return true;
  if (s === "evidence-brief") return itemSources(it).includes("evidence-brief");
  if (s === "funnel-fix") return (it.confirmations ?? []).includes("funnel-fix");
  if (s === "scout") return itemSources(it).includes("scout");
  return true;
}

export function filterEvBySource(r: EvRollup | null, s: SourceFilter): EvRollup | null {
  if (!r) return null;
  if (s === "both" || s === "evidence") return r;
  if (s === "pantheon") return null;
  const items = r.items.filter((i) => evidenceMatchesSource(i, s));
  if (!items.length) return null;
  return { ...r, count: items.length, items, worst: items[0]!.severity };
}

export function evidenceQueue(items: readonly EvidenceItem[] | null | undefined): { toVerify: number; unverified: number } {
  const list = items ?? [];
  return {
    toVerify: list.filter((i) => i.verification === "to_verify").length,
    unverified: list.filter((i) => i.verification === "unverified").length,
  };
}

/** Family-wide queue counts, independent of the source filter (headers stay stable). */
export function familyEvidenceQueue(items: readonly EvidenceItem[] | null | undefined) {
  return evidenceQueue(items);
}

export const SOURCE_CHIP_LABEL: Record<"pantheon" | "evidence-brief" | "funnel-fix" | "scout", string> = {
  pantheon: "Pantheon check",
  "evidence-brief": "Evidence Brief",
  "funnel-fix": "Funnel Fix",
  scout: "Scout",
};
