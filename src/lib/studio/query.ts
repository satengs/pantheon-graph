import type { BacklogItem, BrandId, ProductId } from "@/lib/graph/types";
import type { StateRow } from "@/data/states";

export type StudioFilters = {
  brand: "all" | BrandId;
  product: "all" | ProductId | string;
  layer: "all" | "L1" | "L2";
  impact: "all" | "critical" | "high" | "medium" | "low";
  query: string;
  codes?: string[] | null;
};

export const HIDDEN_UI_CODES = new Set(["S14"]);

export function isHiddenUiCode(code: string | null | undefined): boolean {
  return Boolean(code && HIDDEN_UI_CODES.has(code));
}

export function filterIssues(issues: BacklogItem[], f: StudioFilters): BacklogItem[] {
  const q = f.query.trim().toLowerCase();
  return issues.filter((i) => {
    if (isHiddenUiCode(i.code)) return false;
    if (f.codes && f.codes.length > 0 && !f.codes.includes(i.code)) return false;
    if (f.codes && f.codes.length === 0) return false;
    if (f.brand !== "all" && i.domain !== "both" && i.domain !== "system" && i.domain !== f.brand) {
      return false;
    }
    if (f.product !== "all" && i.product !== "all" && i.product !== f.product) return false;
    if (f.layer !== "all" && i.layer !== f.layer) return false;
    if (f.impact !== "all" && i.impact !== f.impact) return false;
    if (q) {
      const blob = `${i.code} ${i.title} ${i.reason} ${i.fix}`.toLowerCase();
      if (!blob.includes(q)) return false;
    }
    return true;
  });
}

export function stateMatchesBrand(s: StateRow, brand: "all" | BrandId): boolean {
  if (brand === "all" || brand === "pantheon") return true;
  if (brand === "fdr") {
    return s.fdrSettlement !== "none" || s.fdrNearMe || s.fdrCityPages > 0;
  }
  if (brand === "achieve") {
    return (
      s.achieveHeloc !== "none" ||
      s.achievePersonalLoan !== "none" ||
      s.achieveDebtRelief !== "none" ||
      s.achieveCollections
    );
  }
  return false;
}

export function stateMatchesProduct(s: StateRow, product: "all" | ProductId | string): boolean {
  if (product === "all") return true;
  if (product === "settlement" || product === "debt-relief") {
    return s.fdrSettlement !== "none" || s.achieveDebtRelief !== "none";
  }
  if (product === "heloc" || product === "hel") return s.achieveHeloc !== "none";
  if (product === "personal-loan") return s.achievePersonalLoan !== "none";
  if (product === "consolidation") return s.fdrNearMe || s.fdrCityPages > 0;
  if (product === "glossary") return true;
  return true;
}

export function filterStates(states: StateRow[], f: Pick<StudioFilters, "brand" | "product" | "query">): StateRow[] {
  const q = f.query.trim().toLowerCase();
  return states.filter((s) => {
    if (!stateMatchesBrand(s, f.brand)) return false;
    if (!stateMatchesProduct(s, f.product)) return false;
    if (q && !`${s.code} ${s.name}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

export type SortDir = "asc" | "desc";

export function nextSort(current: string | null, dir: SortDir, key: string): { key: string; dir: SortDir } {
  if (current === key) return { key, dir: dir === "asc" ? "desc" : "asc" };
  return { key, dir: "asc" };
}

export function cmp(a: string | number, b: string | number, dir: SortDir): number {
  const av = typeof a === "number" ? a : a.toLowerCase();
  const bv = typeof b === "number" ? b : b.toLowerCase();
  if (av < bv) return dir === "asc" ? -1 : 1;
  if (av > bv) return dir === "asc" ? 1 : -1;
  return 0;
}
