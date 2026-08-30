import { ISSUES } from "@/data/issues";
import { SYSTEM_RULE_SET } from "@/lib/org/system-rules";
import type { BacklogItem } from "@/lib/graph/types";

/** Content/schema rules from the last crawl, plus JSON-LD. */
export const RULE_CODES = [
  "S01",
  "S02",
  "S03",
  "S04",
  "S05",
  "S06",
  "S07",
  "S08",
  "S09",
  "S10",
  "S11",
  "S12",
  "S13",
  "S21",
  "S22",
  "S23",
  "S24",
  "S25",
  "S26",
  "S27",
  "S28",
  "S29",
  "S30",
  "S31",
  "S32",
] as const;

/** Generic check — any origin. Instance findings stay on ISSUES.reason. */
export const RULE_SCOPE: Record<string, string> = {
  S01: "One DefinedTerm owner per glossary slug among sibling sites in a family. Self-canonical on both origins is two owners, not a valid canonical.",
  S02: "A program URL and a method URL must stay two entities. Copy, nav, and FAQ must not treat them as synonyms. Do not retarget an FAQ whose question names a different article.",
  S03: "A glossary definition stays a glossary URL. Product words in that definition link to the matching product URL, not a sibling product.",
  S04: "Tokenize slug + H1. Jaccard < 0.72 unless an explicit sameAs owner is set. Runs on every crawl, every family.",
  S05: "Organization @id is a stable absolute IRI on every origin. Never rotate it. Include legalName.",
  S06: "Sibling brands may sameAs the corporate relationship only. Never sameAs product nodes across brands.",
  S07: "One primary @type per URL. Other types nest under mainEntity or hasPart. Missing JSON-LD fails this rule.",
  S08: "LoanOrCredit nodes include interestRate or annualPercentageRate, amount, and loanTerm from the same source as the calculator.",
  S09: "Sibling product URLs do not share H2 outlines. Shared FAQ lives on a compare URL.",
  S10: "Use-case modules (pay off cards, home project, unexpected expense) are unique per product URL. Shared modules only on a compare URL.",
  S11: "BreadcrumbList matches visible crumbs and the real parent. Lending never nests under debt-relief.",
  S12: "NMLS and origination-fee language only on LoanOrCredit URLs. Settlement/program pages keep program-fee language, never NMLS.",
  S13: "AggregateRating.itemReviewed equals the page’s brand @id. Cross-brand reviews only on a relationship page.",
  S21: "Every indexed URL emits JSON-LD. Pin Organization @id. One primary product type. Nest FAQ.",
  S22: "Two brands may both sell the same class of product. Do not 301 one live product to the other. Two Service nodes, two Organization @ids.",
  S23: "A settlement origin may explain lending. It must not mint LoanOrCredit. Do not 301 explainer articles.",
  S24: "Press stays NewsArticle. A second Service node on a sibling brand’s product path is a graph conflict, not a 301.",
  S25: "Same glossary slug on two origins is not an automatic 301. Split DefinedTerm by meaning (program fee vs loan APR) or sameAs with different names.",
  S26: "Glossary URLs emit DefinedTerm JSON-LD, or they are noindexed. Applies to every glossary template.",
  S27: "Article and NewsArticle include headline, Person or Organization author, datePublished, dateModified, image, and mainEntityOfPage.",
  S28: "title, H1, og:title, and Article.headline are the same string (brand suffix allowed). Every indexed HTML URL.",
  S29: "Learn articles: Person author in schema and a visible byline, same name. NewsArticle may use Organization. Never mix on one URL.",
  S30: "datePublished is first ship. dateModified only when the story changed. Both visible in the byline.",
  S31: "Each Article owns { @id: page#primaryimage }. Never reuse a product hero @id on editorial.",
  S32: "A revolving line of credit and a closed-end loan are different products. Copy, H1, and schema must not alias them. Compare links say compare.",
};

export const RULES: BacklogItem[] = ISSUES.filter((i) =>
  (RULE_CODES as readonly string[]).includes(i.code),
).map((i) => (SYSTEM_RULE_SET.has(i.code) ? { ...i, domain: "system" as const } : i));

export function ruleStatement(i: BacklogItem): string {
  return RULE_SCOPE[i.code] ?? i.reason;
}

export function ruleCheckJson(code: string): string {
  const map: Record<string, unknown> = {
    S01: { engine: "canonical", checks: ["owner"] },
    S04: { engine: "jaccard", threshold: 0.72 },
    S05: { engine: "jsonld", checks: ["org"] },
    S07: { engine: "jsonld", checks: ["type"] },
    S08: { engine: "jsonld", checks: ["props"] },
    S11: { engine: "jsonld", checks: ["breadcrumb"] },
    S13: { engine: "jsonld", checks: ["rating"] },
    S21: { engine: "jsonld", checks: ["exists", "org", "type"] },
    S26: { engine: "jsonld", checks: ["exists", "definedTerm"] },
    S27: { engine: "article", checks: ["headline", "author", "dates", "image"] },
    S28: { engine: "html", checks: ["title", "h1", "og", "headline"] },
    S29: { engine: "article", checks: ["author"] },
    S30: { engine: "article", checks: ["dates"] },
    S31: { engine: "jsonld", checks: ["imageId"] },
    S32: { engine: "copy", checks: ["alias"] },
  };
  return JSON.stringify(map[code] ?? {});
}

export const DEFAULT_BRAND_CONFIG: Record<string, Record<string, unknown>> = {
  fdr: {
    host: "www.freedomdebtrelief.com",
    owns: ["debt-relief", "settlement"],
    schemaOrg: "https://www.freedomdebtrelief.com/#organization",
    toneAllow: ["settlement", "enrolled", "negotiate", "hardship", "program"],
    toneDeny: ["APR", "draw period", "HELOC"],
    analyzeEndpoint: "",
  },
  achieve: {
    host: "www.achieve.com",
    owns: ["heloc", "hel", "personal-loan"],
    schemaOrg: "https://www.achieve.com/#organization",
    toneAllow: ["HELOC", "equity", "draw", "APR", "personal loan"],
    toneDeny: ["enrolled", "negotiate", "settlement program"],
  },
};