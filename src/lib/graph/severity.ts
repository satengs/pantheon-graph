import { crawl, pageUrl } from "@/data/crawl";
import { TREE_SUGGESTIONS } from "@/lib/graph/suggestions";
import type { BacklogItem, BrandId } from "@/lib/graph/types";
import { BRAND_HOST } from "@/lib/graph/types";
import { validateCrawl } from "@/lib/studio/crawl-validate";
import { pagesForRule } from "@/lib/studio/rule-pages";

/**
 * Severity = BacklogItem.impact, the same field the Issues overlay sorts on and
 * the pre-publish gate blocks on (Gate.tsx openCritical/openHigh, liveGate()).
 * No new scoring here — this only indexes which pages each open rule hits.
 */
export type Severity = BacklogItem["impact"];
export const SEVERITIES: Severity[] = ["critical", "high", "medium", "low"];
export const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};
/** Letter inside the badge so the marker never relies on colour alone. */
export const SEVERITY_GLYPH: Record<Severity, string> = { critical: "C", high: "H", medium: "M", low: "L" };
export const SEVERITY_COLOR: Record<Severity, string> = {
  critical: "#ff5a52",
  high: "#ff9a3c",
  medium: "#f0d24a",
  low: "#b49cff",
};

export function severityRank(s: Severity): number {
  return SEVERITIES.indexOf(s);
}

export type SeverityFilter = "all" | "crit-high" | Severity;

export function severityMatches(s: Severity, f: SeverityFilter): boolean {
  if (f === "all") return true;
  if (f === "crit-high") return s === "critical" || s === "high";
  return s === f;
}

export type SevIssue = {
  code: string;
  title: string;
  impact: Severity;
  layer: string;
  why: string;
  fix: string;
};

export type SevRollup = {
  worst: Severity;
  /** Distinct issues (rule codes) on this node or under it. */
  count: number;
  /** Pages carrying at least one of those issues. */
  pages: number;
  /** Sorted worst-first, then by pages hit. */
  issues: Array<SevIssue & { pages: number }>;
};

export function urlKey(url: string): string {
  return url
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/[?#].*$/, "")
    .replace(/\/+$/, "")
    .toLowerCase();
}

export function brandOfUrl(url: string): BrandId | null {
  const k = urlKey(url);
  for (const [b, host] of Object.entries(BRAND_HOST)) {
    const h = urlKey(host);
    if (k === h || k.startsWith(`${h}/`)) return b;
  }
  return null;
}

function brandOfNodeId(id: string): BrandId | null {
  const m = /^(?:brand|hub):([a-z0-9-]+)/.exec(id);
  return m ? m[1]! : null;
}

export type SeverityIndex = {
  byUrl: Map<string, SevIssue[]>;
  rollup: (urls: Iterable<string>) => SevRollup | null;
  forPage: (url: string | undefined) => SevRollup | null;
  forHub: (brand: string, product: string) => SevRollup | null;
  forBrand: (brand: string) => SevRollup | null;
  forAll: () => SevRollup | null;
  brandEdges: Array<{ a: BrandId; b: BrandId; worst: Severity; issues: SevIssue[] }>;
};

/** Build once per visible rule set (same filterIssues + family filter as the Issues overlay). */
export function buildSeverityIndex(rules: BacklogItem[]): SeverityIndex {
  const findings = validateCrawl(crawl);
  const byUrl = new Map<string, SevIssue[]>();
  const urlOf = new Map<string, string>();
  const ruleBrands = new Map<string, Set<BrandId>>();
  for (const r of rules) {
    const sev: SevIssue = {
      code: r.code,
      title: r.title,
      impact: r.impact,
      layer: r.layer,
      why: r.reason,
      fix: r.fix,
    };
    const brands = new Set<BrandId>();
    for (const p of pagesForRule(
      r,
      findings.filter((f) => f.code === r.code),
      Number.POSITIVE_INFINITY,
    )) {
      const k = urlKey(p.url);
      urlOf.set(k, p.url);
      const list = byUrl.get(k) ?? [];
      if (!list.some((x) => x.code === r.code)) list.push(sev);
      byUrl.set(k, list);
      const b = brandOfUrl(p.url);
      if (b) brands.add(b);
    }
    ruleBrands.set(r.code, brands);
  }

  function rollup(keys: Iterable<string>): SevRollup | null {
    const hits = new Map<string, SevIssue & { pages: number }>();
    let pages = 0;
    for (const k of keys) {
      const list = byUrl.get(k);
      if (!list?.length) continue;
      pages += 1;
      for (const i of list) {
        const cur = hits.get(i.code);
        if (cur) cur.pages += 1;
        else hits.set(i.code, { ...i, pages: 1 });
      }
    }
    if (!hits.size) return null;
    const issues = [...hits.values()].sort(
      (a, b) => severityRank(a.impact) - severityRank(b.impact) || b.pages - a.pages || a.code.localeCompare(b.code),
    );
    return { worst: issues[0]!.impact, count: issues.length, pages, issues };
  }

  const crawlKeys = (pred: (b: string, p: string) => boolean) =>
    crawl.pages.filter((p) => pred(p.b, p.p)).map((p) => urlKey(pageUrl(p)));

  const brandEdgeMap = new Map<string, { a: BrandId; b: BrandId; issues: SevIssue[] }>();
  const addPair = (x: BrandId, y: BrandId, r: BacklogItem) => {
    if (x === y) return;
    const [a, b] = [x, y].sort() as [BrandId, BrandId];
    const key = `${a}|${b}`;
    const cur = brandEdgeMap.get(key) ?? { a, b, issues: [] };
    if (!cur.issues.some((i) => i.code === r.code)) {
      cur.issues.push({ code: r.code, title: r.title, impact: r.impact, layer: r.layer, why: r.reason, fix: r.fix });
    }
    brandEdgeMap.set(key, cur);
  };
  for (const r of rules) {
    if (r.layer !== "L2") continue;
    // Cross-brand pair from the existing suggestion map (source/target brand).
    for (const t of TREE_SUGGESTIONS.filter((x) => x.code === r.code)) {
      const sa = brandOfNodeId(t.source);
      const sb = brandOfNodeId(t.target);
      if (sa && sb) addPair(sa, sb, r);
    }
    // Or the rule's own pages span two brands.
    const bs = [...(ruleBrands.get(r.code) ?? [])];
    for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) addPair(bs[i]!, bs[j]!, r);
  }
  const brandEdges = [...brandEdgeMap.values()].map((e) => {
    const issues = e.issues.sort((x, y) => severityRank(x.impact) - severityRank(y.impact) || x.code.localeCompare(y.code));
    return { ...e, issues, worst: issues[0]!.impact };
  });

  const brandUrlKeys = (b: string) => {
    const keys = new Set(crawlKeys((pb) => pb === b));
    // Issue URLs on this host that the crawl did not keep still roll up to the brand.
    for (const [k, u] of urlOf) if (brandOfUrl(u) === b) keys.add(k);
    return keys;
  };

  return {
    byUrl,
    rollup,
    forPage: (url) => (url ? rollup([urlKey(url)]) : null),
    forHub: (b, p) => rollup(new Set(crawlKeys((pb, pp) => pb === b && pp === p))),
    forBrand: (b) => rollup(brandUrlKeys(b)),
    forAll: () => rollup(new Set([...crawl.pages.map((p) => urlKey(pageUrl(p))), ...urlOf.keys()])),
    brandEdges,
  };
}

/** Narrow a rollup to the active severity chip. Null when nothing matches. */
export function filterRollup(r: SevRollup | null, f: SeverityFilter): SevRollup | null {
  if (!r || f === "all") return r;
  const issues = r.issues.filter((i) => severityMatches(i.impact, f));
  if (!issues.length) return null;
  return { worst: issues[0]!.impact, count: issues.length, pages: r.pages, issues };
}
