import { useMemo } from "react";

import { crawl } from "@/data/crawl";
import { RULES } from "@/data/rules-seed";
import type { BacklogItem } from "@/lib/graph/types";
import { issueFitsFamily } from "@/lib/org/catalog";
import { validateCrawl } from "@/lib/studio/crawl-validate";
import { filterIssues, type StudioFilters } from "@/lib/studio/query";
import { useStudio } from "@/store/studio";

/**
 * THE issue source. Graph severity, the Issues list + header and the Gate all read
 * the open rules from here, so totals and every rule's severity (BacklogItem.impact)
 * match exactly. Live-HTML semantic findings (MAIN, REL, H1, FOOT …) are not rules:
 * they have no severity of their own and stay out of these totals everywhere; the
 * Issues view lists them in a separate "Live HTML checks" group.
 */
export type IssueScope = Partial<Omit<StudioFilters, "codes" | "openOnly">> & {
  codes: string[];
  org: Parameters<typeof issueFitsFamily>[1];
  parentSlug: string;
};

export function familyIssues(scope: IssueScope, rules: BacklogItem[] = RULES): BacklogItem[] {
  return filterIssues(rules, {
    brand: scope.brand ?? "all",
    product: scope.product ?? "all",
    layer: scope.layer ?? "all",
    impact: scope.impact ?? "all",
    query: scope.query ?? "",
    codes: scope.codes.length ? scope.codes : undefined,
  }).filter((r) => issueFitsFamily(r, scope.org, scope.parentSlug));
}

export type SevTotals = { critical: number; high: number; medium: number; low: number; total: number };

export function severityTotals(items: Array<Pick<BacklogItem, "impact">>): SevTotals {
  const t: SevTotals = { critical: 0, high: 0, medium: 0, low: 0, total: 0 };
  for (const i of items) {
    t[i.impact] += 1;
    t.total += 1;
  }
  return t;
}

/** Family-wide open rules (no view filters): what Gate, the Issues header and the graph's family node count. */
export function useFamilyIssues(): BacklogItem[] {
  const codes = useStudio((s) => s.attachedRuleCodes);
  const org = useStudio((s) => s.graphOrg);
  const parentSlug = useStudio((s) => s.parentSlug);
  return useMemo(() => familyIssues({ codes, org, parentSlug }), [codes, org, parentSlug]);
}

let crawlFindingsCache: ReturnType<typeof validateCrawl> | null = null;
/** Findings derived from the crawl snapshot — the same page evidence the graph uses. */
export function crawlFindings() {
  crawlFindingsCache ??= validateCrawl(crawl);
  return crawlFindingsCache;
}
