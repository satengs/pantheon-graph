import type { BacklogItem } from "@/lib/graph/types";

export type BacklogLane = "fdr" | "achieve" | "issue" | "performance";

export const LANES: { id: BacklogLane; label: string }[] = [
  { id: "fdr", label: "FDR" },
  { id: "achieve", label: "Achieve" },
  { id: "issue", label: "Issues" },
  { id: "performance", label: "Performance" },
];

export function laneForRule(r: BacklogItem): BacklogLane {
  if (r.acceptance.cwv === "fail" || r.acceptance.psi.performance < 80) return "performance";
  if (r.domain === "fdr") return "fdr";
  if (r.domain === "achieve") return "achieve";
  return "issue";
}

export function ruleInLane(r: BacklogItem, lane: BacklogLane): boolean {
  if (lane === "performance") return r.acceptance.cwv === "fail" || r.acceptance.psi.performance < 80;
  if (lane === "fdr") return r.domain === "fdr" || r.domain === "both";
  if (lane === "achieve") return r.domain === "achieve" || r.domain === "both";
  return r.domain === "system" || r.domain === "both";
}
