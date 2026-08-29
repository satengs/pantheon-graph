export type BrandId = string;
export type Layer = "L1" | "L2";
export type IssueStatus = "open" | "studio" | "suggested";
export type NodeKind = "parent" | "brand" | "product" | "glossary" | "issue" | "page";
export type ProductId =
  | "debt-relief"
  | "settlement"
  | "heloc"
  | "hel"
  | "personal-loan"
  | "consolidation"
  | "glossary"
  | "other";

export type CrawlKind = "g" | "a" | "u" | "r" | "p";

export type CrawlPage = {
  b: BrandId;
  k: CrawlKind;
  p: ProductId;
  path: string;
};

export type GlossaryPair = {
  slug: string;
  fdr: string;
  achieve: string;
};

export type CrawlSnapshot = {
  crawledAt: string;
  source: { fdr: string; achieve: string };
  counts: { fdr: number; achieve: number };
  pages: CrawlPage[];
  glossaryOverlap: GlossaryPair[];
  glossaryNear: Array<{
    fdr_slug: string;
    ach_slug: string;
    fdr: string;
    achieve: string;
  }>;
};

export type Citation = {
  url: string;
  brand: BrandId;
  quote: string;
  location: string;
  whyReal: string;
};

export type Acceptance = {
  originPass: boolean;
  pagePass: boolean;
  psi: { performance: number; accessibility: number; seo: number; lcpMs: number };
  cache: "HIT" | "MISS" | "DYNAMIC";
  cwv: "pass" | "fail";
};

export type BacklogItem = {
  id: string;
  code: string;
  title: string;
  layer: Layer;
  domain: "fdr" | "achieve" | "both" | "system" | string;
  product: ProductId | "all";
  reason: string;
  fix: string;
  impact: "critical" | "high" | "medium" | "low";
  status: IssueStatus;
  urls: string[];
  citations: Citation[];
  acceptance: Acceptance;
};

export type GraphNode = {
  id: string;
  label: string;
  kind: NodeKind;
  brand?: BrandId;
  product?: ProductId;
  count?: number;
  url?: string;
  issueId?: string;
};

export type GraphEdge = {
  id: string;
  source: string;
  target: string;
  kind: "owns" | "conflict" | "suggests" | "cites" | "sameAs";
  label?: string;
  issueId?: string;
};

export const BRAND_HOST: Record<string, string> = {
  fdr: "https://www.freedomdebtrelief.com",
  achieve: "https://www.achieve.com",
};

export const PRODUCT_LABEL: Record<ProductId, string> = {
  "debt-relief": "Debt relief",
  settlement: "Settlement",
  heloc: "HELOC",
  hel: "Home equity loan",
  "personal-loan": "Personal loans",
  consolidation: "Consolidation",
  glossary: "Glossary",
  other: "Other",
};

export const BRAND_LABEL: Record<string, string> = {
  fdr: "Freedom Debt Relief",
  achieve: "Achieve",
  pantheon: "Pantheon",
};

export function brandLabel(id: string): string {
  return BRAND_LABEL[id] ?? id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function productLabel(id: string): string {
  return id in PRODUCT_LABEL ? PRODUCT_LABEL[id as ProductId] : id.replace(/-/g, " ");
}
