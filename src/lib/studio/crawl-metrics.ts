import type { CrawlSnapshot } from "@/lib/graph/types";
import { RULES } from "@/data/rules-seed";

export type CrawlMetrics = {
  crawledAt: string;
  pages: { fdr: number; achieve: number; total: number };
  glossary: { fdr: number; achieve: number; overlap: number; overlapRate: number };
  clones: { exact: number };
  ownership: { fdrLending: number; achieveRelief: number };
  schema: { achieveGlossaryNoLd: number; schemaErrorRate: number };
  gate: { open: number; critical: number; rules: number; failRate: number };
};

export function crawlMetrics(crawl: CrawlSnapshot): CrawlMetrics {
  const fdrG = crawl.pages.filter((p) => p.b === "fdr" && p.k === "g").length;
  const achG = crawl.pages.filter((p) => p.b === "achieve" && p.k === "g").length;
  const fdrPaths = new Set(crawl.pages.filter((p) => p.b === "fdr").map((p) => p.path.replace(/\/$/, "") || "/"));
  const achPaths = new Set(crawl.pages.filter((p) => p.b === "achieve").map((p) => p.path.replace(/\/$/, "") || "/"));
  let exact = 0;
  for (const p of fdrPaths) if (achPaths.has(p)) exact += 1;
  const fdrLending = crawl.pages.filter((p) => p.b === "fdr" && (p.p === "heloc" || p.p === "hel" || p.p === "personal-loan")).length;
  const achieveRelief = crawl.pages.filter((p) => p.b === "achieve" && (p.p === "debt-relief" || p.p === "settlement")).length;
  const open = RULES.filter((r) => r.status === "open");
  const critical = open.filter((r) => r.impact === "critical").length;
  const glossDen = Math.max(fdrG, 1);
  return {
    crawledAt: crawl.crawledAt,
    pages: { fdr: crawl.counts.fdr, achieve: crawl.counts.achieve, total: crawl.pages.length },
    glossary: {
      fdr: fdrG,
      achieve: achG,
      overlap: crawl.glossaryOverlap.length,
      overlapRate: crawl.glossaryOverlap.length / glossDen,
    },
    clones: { exact },
    ownership: { fdrLending, achieveRelief },
    schema: {
      achieveGlossaryNoLd: achG,
      schemaErrorRate: achG / Math.max(fdrG + achG, 1),
    },
    gate: {
      open: open.length,
      critical,
      rules: RULES.length,
      failRate: open.length / Math.max(RULES.length, 1),
    },
  };
}

export function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}
