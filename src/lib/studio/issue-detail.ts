import { brandLabel, productLabel } from "../graph/types.ts";

export const PAGE_LEVEL = "Page-level";

const FINDING_SECTION: Record<string, string> = {
  H1: "H1",
  SKIP: "outline block",
  FAQ: "FAQ",
  REL: "related block",
  FOOT: "footer",
  NOFOOT: "footer",
  TITLE: "title",
  S05: "JSON-LD",
  S07: "JSON-LD",
  S08: "JSON-LD",
  S21: "JSON-LD",
  S26: "JSON-LD",
  S27: "schema node",
  S28: "title",
  S29: "schema node",
  S30: "schema node",
  S31: "schema node",
};

export type IssueOrgBrand = { slug: string; name: string; url: string };
export type IssueOrg = {
  parent?: { slug: string; name: string; url?: string } | null;
  brands?: IssueOrgBrand[];
};

export type CitationLike = {
  url: string;
  brand?: string;
  quote: string;
  location?: string;
  whyReal?: string;
};

export type FindingLike = {
  id: string;
  code: string;
  title: string;
  lane?: string;
  url: string;
  why: string;
  found: string;
  suggested: string;
};

export type IssueLike = {
  id: string;
  code: string;
  title: string;
  reason: string;
  fix: string;
  urls: string[];
  citations: CitationLike[];
  domain: string;
  product: string;
  impact: string;
  layer: string;
  acceptance?: { originPass?: boolean; pagePass?: boolean };
};

export type ProofLike = {
  conflict: string;
  rows: Array<{ brand: string; url: string; h1: string; canonical: string; extra: string }>;
};

export type HistoryLike = {
  kind: string;
  label: string;
  created_at?: string;
};

export type IssueDetailPage = {
  url: string;
  path: string;
  brand: string;
  brandLabel: string;
  product: string;
  productLabel: string;
};

export type LiveGate = {
  blocks: boolean;
  label: "Blocks live" | "Doesn't block live";
};

export function liveGate(impact: string, originPass?: boolean): LiveGate {
  if (originPass === false || impact === "critical" || impact === "high") {
    return { blocks: true, label: "Blocks live" };
  }
  return { blocks: false, label: "Doesn't block live" };
}

export type IssueDetailView = {
  id: string;
  code: string;
  kind: "rule" | "html";
  what: string;
  why: string;
  fix: string;
  section: string;
  impact: string;
  layer: string;
  gate: LiveGate;
  page: IssueDetailPage;
  pages: IssueDetailPage[];
  evidence: {
    quotes: Array<{ url: string; quote: string; location: string; whyReal: string; brand: string }>;
    found: string;
    suggested: string;
    proofConflict: string;
    proofRows: ProofLike["rows"];
  };
  history: Array<{ when: string; label: string; kind: string }>;
};

export type IssueListRow = {
  id: string;
  code: string;
  kind: "rule" | "html";
  pageUrl: string;
  pagePath: string;
  brand: string;
  brandLabel: string;
  product: string;
  productLabel: string;
  section: string;
  what: string;
  impact: string;
  layer: string;
};

function hostOf(url: string): string {
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).host.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function pagePath(url: string): string {
  if (!url.trim()) return "(no URL)";
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    const host = u.host.replace(/^www\./, "");
    const path = u.pathname.replace(/\/$/, "") || "";
    return `${host}${path}${u.search}`;
  } catch {
    return url.replace(/^https?:\/\//i, "").replace(/\/$/, "");
  }
}

export function samePage(a: string, b: string): boolean {
  const n = (u: string) => u.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/+$/, "").toLowerCase();
  return Boolean(a && b && n(a) === n(b));
}

export function brandForUrl(
  url: string,
  org?: IssueOrg | null,
  domain?: string,
): { slug: string; label: string } {
  if (domain && domain !== "both" && domain !== "system" && domain !== "all" && domain !== "issue" && domain !== "performance") {
    return { slug: domain, label: brandLabel(domain) };
  }
  const host = hostOf(url);
  for (const b of org?.brands ?? []) {
    const bh = hostOf(b.url || "");
    if (bh && host && (host === bh || host.endsWith(`.${bh}`) || bh.endsWith(`.${host}`))) {
      return { slug: b.slug, label: b.name || brandLabel(b.slug) };
    }
  }
  if (host.includes("freedomdebtrelief")) return { slug: "fdr", label: brandLabel("fdr") };
  if (host === "achieve.com" || host.endsWith(".achieve.com")) return { slug: "achieve", label: brandLabel("achieve") };
  if (host) return { slug: host, label: host };
  return { slug: "", label: "" };
}

function productFor(url: string, product?: string): { id: string; label: string } {
  if (product && product !== "all") return { id: product, label: productLabel(product) };
  const p = url.toLowerCase();
  if (p.includes("/glossary")) return { id: "glossary", label: productLabel("glossary") };
  if (p.includes("heloc")) return { id: "heloc", label: productLabel("heloc") };
  if (p.includes("home-equity") || /\/hel(\/|$)/.test(p)) return { id: "hel", label: productLabel("hel") };
  if (p.includes("personal-loan") || p.includes("personal_loan")) return { id: "personal-loan", label: productLabel("personal-loan") };
  if (p.includes("settlement")) return { id: "settlement", label: productLabel("settlement") };
  if (p.includes("consolidat")) return { id: "consolidation", label: productLabel("consolidation") };
  if (p.includes("debt-relief") || p.includes("debtrelief")) return { id: "debt-relief", label: productLabel("debt-relief") };
  return { id: "all", label: "" };
}

export function issueSection(input: {
  citations?: CitationLike[];
  pageUrl?: string;
  code?: string;
  proofH1?: string;
}): string {
  const page = input.pageUrl ?? "";
  const cites = input.citations ?? [];
  const matching = page
    ? cites.find((c) => c.location?.trim() && c.url && samePage(c.url, page))
    : undefined;
  if (matching?.location?.trim()) return matching.location.trim();
  const any = cites.find((c) => c.location?.trim());
  if (any?.location?.trim()) return any.location.trim();
  if (input.code && FINDING_SECTION[input.code]) return FINDING_SECTION[input.code]!;
  if (input.proofH1?.trim()) return `H1 · ${input.proofH1.trim()}`;
  return PAGE_LEVEL;
}

function toPage(url: string, org: IssueOrg | null | undefined, domain?: string, product?: string): IssueDetailPage {
  const brand = brandForUrl(url, org, domain);
  const prod = productFor(url, product);
  return {
    url,
    path: pagePath(url),
    brand: brand.slug,
    brandLabel: brand.label,
    product: prod.id,
    productLabel: prod.label,
  };
}

export function formatIssueDetail(input: {
  issue?: IssueLike | null;
  finding?: FindingLike | null;
  proof?: ProofLike | null;
  crawlAt?: string | null;
  history?: HistoryLike[] | null;
  org?: IssueOrg | null;
}): IssueDetailView | null {
  const issue = input.issue ?? null;
  const finding = input.finding ?? null;
  if (!issue && !finding) return null;

  const domain = issue?.domain || "";
  const url = (finding?.url || issue?.citations.find((c) => c.url)?.url || issue?.urls[0] || "").trim();
  const page = toPage(url, input.org, domain, issue?.product);

  const extra: string[] = [];
  if (finding?.url) extra.push(finding.url);
  for (const u of issue?.urls ?? []) extra.push(u);
  const seen = new Set<string>();
  const pages: IssueDetailPage[] = [];
  for (const u of extra) {
    if (!u || seen.has(u)) continue;
    seen.add(u);
    pages.push(toPage(u, input.org, domain, issue?.product));
  }

  const proofRow = input.proof?.rows.find((r) => samePage(r.url, url)) ?? input.proof?.rows[0];
  const quotes = (issue?.citations ?? [])
    .filter((c) => c.quote?.trim())
    .map((c) => ({
      url: c.url,
      quote: c.quote,
      location: c.location?.trim() || PAGE_LEVEL,
      whyReal: c.whyReal ?? "",
      brand: c.brand ?? brandForUrl(c.url, input.org).slug,
    }));

  const history: IssueDetailView["history"] = [];
  if (input.crawlAt?.trim()) {
    history.push({ when: input.crawlAt.trim(), label: "Last crawl snapshot", kind: "crawl" });
  }
  for (const h of input.history ?? []) {
    if (!h.label?.trim() && !h.created_at?.trim()) continue;
    history.push({
      when: (h.created_at ?? "").trim(),
      label: (h.label || h.kind || "Previous crawl").trim(),
      kind: h.kind || "history",
    });
  }

  return {
    id: finding?.id || issue?.id || "",
    code: finding?.code || issue?.code || "",
    kind: issue ? "rule" : "html",
    what: (finding?.title || issue?.title || "").trim(),
    why: (finding?.why || issue?.reason || "").trim(),
    fix: (issue?.fix || finding?.suggested || "").trim(),
    section: issueSection({
      citations: issue?.citations,
      pageUrl: url,
      code: finding?.code || issue?.code,
      proofH1: proofRow?.h1,
    }),
    impact: issue?.impact || (finding ? "high" : ""),
    layer: issue?.layer || (finding ? "L1" : ""),
    gate: liveGate(issue?.impact || (finding ? "high" : ""), issue?.acceptance?.originPass),
    page,
    pages,
    evidence: {
      quotes,
      found: finding?.found ?? "",
      suggested: finding?.suggested ?? "",
      proofConflict: input.proof?.conflict ?? "",
      proofRows: input.proof?.rows ?? [],
    },
    history,
  };
}

export function formatIssueListRow(input: {
  id: string;
  code: string;
  kind?: "rule" | "html";
  title: string;
  url?: string;
  urls?: string[];
  citations?: CitationLike[];
  domain?: string;
  product?: string;
  impact?: string;
  layer?: string;
  proofH1?: string;
  org?: IssueOrg | null;
}): IssueListRow {
  const url = (input.url || input.citations?.find((c) => c.url)?.url || input.urls?.[0] || "").trim();
  const page = toPage(url, input.org, input.domain, input.product);
  return {
    id: input.id,
    code: input.code,
    kind: input.kind ?? "rule",
    pageUrl: url,
    pagePath: page.path,
    brand: page.brand,
    brandLabel: page.brandLabel,
    product: page.product,
    productLabel: page.productLabel,
    section: issueSection({
      citations: input.citations,
      pageUrl: url,
      code: input.code,
      proofH1: input.proofH1,
    }),
    what: input.title.trim(),
    impact: input.impact ?? "",
    layer: input.layer ?? "",
  };
}

export function hasEvidence(v: IssueDetailView): boolean {
  const e = v.evidence;
  return Boolean(e.quotes.length || e.found.trim() || e.suggested.trim() || e.proofConflict.trim() || e.proofRows.length);
}
