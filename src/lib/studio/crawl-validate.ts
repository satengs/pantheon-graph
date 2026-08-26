import type { CrawlSnapshot } from "@/lib/graph/types";
import { BRAND_HOST } from "@/lib/graph/types";
import type { HtmlFinding } from "@/lib/html/semantic";

const LEND_SLUGS = [
  "annual-percentage-rate",
  "fixed-interest-rate",
  "mortgage",
  "personal-loan",
  "variable-interest-rate",
];

function finding(
  code: string,
  title: string,
  url: string,
  why: string,
  found: string,
  suggested: string,
  lane: HtmlFinding["lane"] = "issue",
): HtmlFinding {
  return { id: `${code}:${url}`, code, title, lane, url, why, found, suggested };
}

/** Checks that use the last crawl only — no live fetch. */
export function validateCrawl(crawl: CrawlSnapshot): HtmlFinding[] {
  const out: HtmlFinding[] = [];
  const fdrPaths = new Set(crawl.pages.filter((p) => p.b === "fdr").map((p) => p.path.replace(/\/$/, "") || "/"));
  const achPaths = new Set(crawl.pages.filter((p) => p.b === "achieve").map((p) => p.path.replace(/\/$/, "") || "/"));

  if (crawl.glossaryOverlap.length) {
    const sample = crawl.glossaryOverlap.slice(0, 8);
    out.push(
      finding(
        "S01",
        `${crawl.glossaryOverlap.length} glossary slugs on both origins`,
        sample[0]?.fdr ?? `${BRAND_HOST.fdr}/glossary/`,
        "Last crawl. Same slug, two URLs. Each page self-canonicals — that looks valid and is the duplicate.",
        sample.map((p) => `${p.slug}\n  FDR ${p.fdr}\n  ACH ${p.achieve}`).join("\n"),
        "One owner per slug. Non-owner 301 or rel=canonical to the owner, not to itself.",
        "issue",
      ),
    );
  }

  for (const n of crawl.glossaryNear) {
    out.push(
      finding(
        "S04",
        `Near-duplicate slugs ${n.fdr_slug} ~ ${n.ach_slug}`,
        n.fdr,
        "Last crawl. Token-near glossary slugs across brands, not the same string.",
        `FDR ${n.fdr_slug} → ${n.fdr}\nACH ${n.ach_slug} → ${n.achieve}`,
        "Pick one slug. 301 the other or mark sameAs with a single owner.",
        "issue",
      ),
    );
  }

  if (fdrPaths.has("/debt-relief") && achPaths.has("/debt-relief")) {
    out.push(
      finding(
        "S22",
        "Both brands index /debt-relief as a product URL",
        `${BRAND_HOST.fdr}/debt-relief/`,
        "Last crawl path clone, not a glossary slug. Two product nodes for one ask.",
        `FDR ${BRAND_HOST.fdr}/debt-relief/\nACH ${BRAND_HOST.achieve}/debt-relief`,
        "FDR owns debt relief. Achieve /debt-relief should 301 or canonical to FDR, or become a labeled relationship page.",
        "fdr",
      ),
    );
  }

  const fdrLending = crawl.pages.filter((p) => p.b === "fdr" && (p.p === "heloc" || p.p === "hel" || p.p === "personal-loan"));
  if (fdrLending.length) {
    const lines = fdrLending.slice(0, 12).map((p) => `${p.p}  ${BRAND_HOST.fdr}${p.path}`);
    out.push(
      finding(
        "S23",
        `FDR sitemap lists ${fdrLending.length} lending URLs`,
        `${BRAND_HOST.fdr}/learn/loans/how-does-a-heloc-work/`,
        "Last crawl. HELOC, home equity, and personal-loan URLs on the settlement origin steal Achieve's entities.",
        lines.join("\n"),
        "Move or noindex FDR lending articles. Point internally to Achieve product URLs with labeled compare links.",
        "fdr",
      ),
    );
  }

  const achRelief = crawl.pages.filter((p) => p.b === "achieve" && (p.p === "debt-relief" || p.p === "settlement"));
  if (achRelief.length) {
    const lines = achRelief.slice(0, 12).map((p) => `${p.p} ${p.k}  ${BRAND_HOST.achieve}${p.path}`);
    out.push(
      finding(
        "S24",
        `Achieve sitemap lists ${achRelief.length} debt-relief/settlement URLs`,
        `${BRAND_HOST.achieve}/debt-relief`,
        "Last crawl. Achieve should not own the relief product node. Press URLs plus /debt-relief compete with FDR.",
        lines.join("\n"),
        "Keep press as NewsArticle. Product /debt-relief on Achieve must not be a Service node; canonical to FDR or a relationship page.",
        "achieve",
      ),
    );
  }

  const lendHits = crawl.glossaryOverlap.filter((p) => LEND_SLUGS.includes(p.slug));
  if (lendHits.length) {
    out.push(
      finding(
        "S25",
        `FDR glossary lists ${lendHits.length} lending terms Achieve should own`,
        lendHits[0]!.fdr,
        "Last crawl. APR, mortgage, personal-loan, interest-rate slugs are on both glossaries. FDR should not be the DefinedTerm owner.",
        lendHits.map((p) => `${p.slug}\n  ${p.fdr}\n  ${p.achieve}`).join("\n"),
        "Achieve owns lending DefinedTerms. FDR pages 301 or canonical to Achieve and keep a sameAs stub.",
        "fdr",
      ),
    );
  }

  const fdrGloss = crawl.pages.filter((p) => p.b === "fdr" && p.k === "g").length;
  const achGloss = crawl.pages.filter((p) => p.b === "achieve" && p.k === "g").length;
  if (fdrGloss && achGloss) {
    out.push(
      finding(
        "S26",
        "Achieve glossary templates emit no JSON-LD",
        `${BRAND_HOST.achieve}/glossary/d/debt-relief`,
        `Last crawl has ${achGloss} Achieve glossary URLs. Live HTML for those templates has no application/ld+json (FDR emits DefinedTerm).`,
        `Achieve glossary URLs: ${achGloss}\nFDR glossary URLs: ${fdrGloss}\nCaptured: achieve.com/glossary/d/debt-relief → no JSON-LD\nFDR same slug → DefinedTerm + FinancialService`,
        "Add DefinedTerm JSON-LD on Achieve glossary, or noindex and canonical to the FDR owner for relief terms.",
        "achieve",
      ),
    );
  }

  return out;
}
