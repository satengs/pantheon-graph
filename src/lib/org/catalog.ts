import { RULES } from "@/data/rules-seed";
import { SYSTEM_RULE_CODES, isSystemRule } from "@/lib/org/system-rules";
import type { ProductId } from "@/lib/graph/types";
import type { GraphOrg } from "@/lib/graph/model";
import { isOpenIssue } from "@/lib/studio/query";

export { SYSTEM_RULE_CODES, SYSTEM_RULE_SET, isSystemRule } from "@/lib/org/system-rules";

export const SEED_PARENT = {
  slug: "pantheon",
  name: "Pantheon",
  website: "",
} as const;

export const SEED_BRANDS = [
  {
    slug: "fdr",
    name: "Freedom Debt Relief",
    website: "https://www.freedomdebtrelief.com/",
    host: "www.freedomdebtrelief.com",
    products: ["debt-relief", "settlement", "consolidation", "glossary"] as ProductId[],
  },
  {
    slug: "achieve",
    name: "Achieve",
    website: "https://www.achieve.com/",
    host: "www.achieve.com",
    products: ["heloc", "hel", "personal-loan", "consolidation", "glossary"] as ProductId[],
  },
] as const;

export type OrgKind = "parent" | "brand";

export type OrgProbe = {
  fetchedAt?: string;
  ok?: boolean;
  error?: string;
  title?: string;
  h1?: string;
  canonical?: string;
  hasJsonLd?: boolean;
  orgName?: string;
  orgId?: string;
  schemaTypes?: string[];
  sitemapUrl?: string;
  pageCount?: number;
  products?: string[];
  samplePaths?: string[];
};

export type StudioOrg = {
  id: string;
  slug: string;
  name: string;
  kind: OrgKind;
  parentId: string | null;
  website: string;
  host: string;
  products: string[];
  probe: OrgProbe;
  includeInGraph: boolean;
  ruleCodes: string[];
};

export type CoverageItem = {
  id: string;
  label: string;
  detail: string;
  status: "ok" | "warn" | "miss";
  group: "structure" | "system" | "brand";
};

export function slugify(name: string): string {
  const s = name
    .toLowerCase()
    .replace(/https?:\/\//g, "")
    .replace(/^www\./, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return s || "brand";
}

export const PRODUCT_MAX_PER_BRAND = 16;

export function slugProduct(raw: string): string {
  const s = raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return s;
}

export function validateProductName(raw: string): string | undefined {
  const slug = slugProduct(raw);
  if (!slug) return "Name the product";
  if (slug.length < 2) return "Use at least 2 characters";
  if (!/[a-z]/.test(slug)) return "Include a letter";
  return undefined;
}

export function normalizeProductList(raw: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const slug = slugProduct(item);
    if (!slug || seen.has(slug)) continue;
    if (validateProductName(slug)) continue;
    seen.add(slug);
    out.push(slug);
    if (out.length >= PRODUCT_MAX_PER_BRAND) break;
  }
  return out;
}

export function productsForFamily(
  brands: Array<{ slug: string; products: string[] }>,
  brandFilter: string,
): string[] {
  const list = brandFilter === "all" ? brands : brands.filter((b) => b.slug === brandFilter);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const b of list) {
    for (const p of b.products) {
      if (!p || seen.has(p)) continue;
      seen.add(p);
      out.push(p);
    }
  }
  return out;
}

export function hostOf(website: string): string {
  try {
    return new URL(website.startsWith("http") ? website : `https://${website}`).host.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function parseRuleCodes(raw: string | null | undefined): string[] {
  try {
    const v = JSON.parse(raw || "[]") as unknown;
    return Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && x.length > 0))] : [];
  } catch {
    return [];
  }
}

export const SEED_BRAND_SLUGS = new Set<string>(SEED_BRANDS.map((b) => b.slug));

export function isSeedFamily(org: GraphOrg | null | undefined, parentSlug?: string): boolean {
  if (parentSlug === SEED_PARENT.slug) return true;
  return Boolean(org?.brands.some((b) => SEED_BRAND_SLUGS.has(b.slug)));
}

export function hostOfUrl(website: string): string {
  return hostOf(website);
}

export function familyHosts(org: GraphOrg | null | undefined): string[] {
  if (!org) return [];
  const hosts: string[] = [];
  if (org.parent?.url) {
    const h = hostOf(org.parent.url);
    if (h) hosts.push(h);
  }
  for (const b of org.brands) {
    const h = hostOf(b.url || "");
    if (h) hosts.push(h);
  }
  return [...new Set(hosts)];
}

export function urlInFamily(url: string, org: GraphOrg | null | undefined): boolean {
  const hosts = familyHosts(org);
  if (!hosts.length || !url) return false;
  const h = hostOf(url);
  if (!h) return false;
  return hosts.some((x) => h === x || h.endsWith(`.${x}`) || x.endsWith(`.${h}`));
}

export function familyPageCount(org: GraphOrg | null | undefined): number {
  return org?.brands.reduce((n, b) => n + (b.pageCount ?? 0), 0) ?? 0;
}

export function issueFitsFamily(
  issue: { code: string; urls: string[]; domain: string },
  org: GraphOrg | null | undefined,
  parentSlug?: string,
): boolean {
  if (isSeedFamily(org, parentSlug)) return true;
  if (!issue.urls.length) return false;
  return issue.urls.some((u) => urlInFamily(u, org));
}

export function pickIssueForFamily(
  codes: string[],
  current: string | null,
  org?: GraphOrg | null,
  parentSlug?: string,
): string | null {
  const pool = RULES.filter(
    (r) =>
      isOpenIssue(r.status) &&
      (!codes.length || codes.includes(r.code)) &&
      issueFitsFamily(r, org ?? null, parentSlug),
  );
  if (current && pool.some((r) => r.code === current || r.id === current)) return current;
  return pool[0]?.code ?? null;
}

export function brandSeedRules(): Array<{ code: string; title: string; why: string; domain: string }> {
  return RULES.filter((r) => !isSystemRule(r.code, r.domain)).map((r) => ({
    code: r.code,
    title: r.title,
    why: r.reason,
    domain: r.domain,
  }));
}

export function computeCoverage(
  parent: StudioOrg | null,
  brands: StudioOrg[],
  ruleCodes: string[],
): CoverageItem[] {
  const systemHave = SYSTEM_RULE_CODES.filter((c) => ruleCodes.includes(c));
  const brandRules = RULES.filter((r) => !isSystemRule(r.code, r.domain));
  const brandHave = brandRules.filter((r) => ruleCodes.includes(r.code));
  const withSite = brands.filter((b) => b.website);
  const probed = brands.filter((b) => b.probe.ok);
  const withMap = brands.filter((b) => (b.probe.pageCount ?? 0) > 0);
  const withOrg = brands.filter((b) => b.probe.orgId || b.probe.orgName);
  const withProducts = brands.filter((b) => b.products.length > 0);
  const seedSlugs = new Set<string>(SEED_BRANDS.map((b) => b.slug));
  const isSeed = brands.some((b) => seedSlugs.has(b.slug));

  return [
    {
      id: "parent",
      group: "structure",
      label: "Parent company",
      detail: parent ? parent.name : "Register a holding company to wrap the brands.",
      status: parent ? "ok" : "miss",
    },
    {
      id: "subs",
      group: "structure",
      label: "Sub-companies",
      detail: brands.length ? brands.map((b) => b.name).join(" · ") : "Add at least one brand under the parent.",
      status: brands.length >= 2 ? "ok" : brands.length === 1 ? "warn" : "miss",
    },
    {
      id: "website",
      group: "structure",
      label: "Website on each brand",
      detail: withSite.length ? `${withSite.length}/${brands.length} have a URL` : "Paste a homepage — Retrieve fills the rest.",
      status: brands.length > 0 && withSite.length === brands.length ? "ok" : withSite.length ? "warn" : "miss",
    },
    {
      id: "probe",
      group: "structure",
      label: "Homepage retrieved",
      detail: probed.length ? `${probed.length} live fetches (title, H1, schema)` : "Retrieve from URL to pull schema and nav.",
      status: brands.length > 0 && probed.length === brands.length ? "ok" : probed.length ? "warn" : "miss",
    },
    {
      id: "sitemap",
      group: "structure",
      label: "Sitemap / page inventory",
      detail: withMap.length
        ? withMap.map((b) => `${b.name} ${(b.probe.pageCount ?? 0).toLocaleString()} pages`).join(" · ")
        : "FDR + Achieve seed from the last crawl. New brands need a sitemap fetch.",
      status: withMap.length === brands.length && brands.length > 0 ? "ok" : withMap.length ? "warn" : "miss",
    },
    {
      id: "schema-org",
      group: "system",
      label: "Organization schema",
      detail: withOrg.length
        ? withOrg.map((b) => b.probe.orgId || b.probe.orgName || b.name).join(" · ")
        : "Stable Organization @id on the homepage.",
      status: withOrg.length === brands.length && brands.length > 0 ? "ok" : withOrg.length ? "warn" : "miss",
    },
    {
      id: "system-rules",
      group: "system",
      label: "Default system rules",
      detail: `${systemHave.length}/${SYSTEM_RULE_CODES.length} attached — schema, canonical, JSON-LD, article semantics.`,
      status: systemHave.length === SYSTEM_RULE_CODES.length ? "ok" : systemHave.length ? "warn" : "miss",
    },
    {
      id: "products",
      group: "structure",
      label: "Products mapped",
      detail: withProducts.length
        ? brands.flatMap((b) => b.products).slice(0, 8).join(", ")
        : "Detect from the site, or type them in.",
      status: withProducts.length === brands.length && brands.length > 0 ? "ok" : withProducts.length ? "warn" : "miss",
    },
    {
      id: "brand-rules",
      group: "brand",
      label: "Brand-specific rules",
      detail: isSeed
        ? `${brandHave.length} ownership / tone / silo rules from the FDR × Achieve set.`
        : brandHave.length
          ? `${brandHave.length} brand rules on this family.`
          : "None yet. Write them on the Rules tab — we don't suggest another family's checks.",
      status: isSeed ? (brandHave.length >= 8 ? "ok" : "warn") : brandHave.length ? "ok" : "warn",
    },
    {
      id: "states",
      group: "brand",
      label: "State / geo coverage",
      detail: isSeed ? "51-state catalog on the States tab." : "Not fetched for a new origin — add later if you license by state.",
      status: isSeed ? "ok" : "miss",
    },
  ];
}

export function missingForNewOrg(
  ruleCodes: string[],
  brands: Array<{ slug: string }> = [],
  parentSlug?: string,
): Array<{ code: string; title: string; why: string }> {
  const have = new Set(ruleCodes);
  const out: Array<{ code: string; title: string; why: string }> = [];
  for (const code of SYSTEM_RULE_CODES) {
    if (have.has(code)) continue;
    const r = RULES.find((x) => x.code === code);
    if (r) out.push({ code: r.code, title: r.title, why: "Default system check — should attach to every new origin." });
  }
  const seed = parentSlug === SEED_PARENT.slug || brands.some((b) => SEED_BRAND_SLUGS.has(b.slug));
  if (!seed) return out;
  for (const r of RULES) {
    if (isSystemRule(r.code, r.domain)) continue;
    if (have.has(r.code)) continue;
    out.push({
      code: r.code,
      title: r.title,
      why: "Brand-specific in the FDR × Achieve set.",
    });
  }
  return out;
}
