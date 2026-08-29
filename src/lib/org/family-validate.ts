import { SYSTEM_RULE_SET } from "./system-rules.ts";

const SEED_PARENT_SLUG = "pantheon";
const SEED_BRAND_SLUGS = new Set(["fdr", "achieve"]);

export type FamilySite = {
  slug: string;
  website: string;
  parentId: string | null;
};

export function familyIsSeed(parentSlug: string | undefined, brandSlugs: string[]): boolean {
  if (parentSlug === SEED_PARENT_SLUG) return true;
  return brandSlugs.some((s) => SEED_BRAND_SLUGS.has(s));
}

function hostOf(website: string): string {
  try {
    return new URL(website.startsWith("http") ? website : `https://${website}`).host.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function recheckTargets(opts: {
  parentId?: string;
  parentWebsite?: string;
  parentSlug?: string;
  brands: FamilySite[];
  isSeed?: boolean;
  seedUrls?: string[];
}): string[] {
  const brands = opts.parentId ? opts.brands.filter((b) => b.parentId === opts.parentId) : opts.brands;
  const slugs = brands.map((b) => b.slug);
  const isSeed = opts.isSeed ?? familyIsSeed(opts.parentSlug, slugs);
  const urls: string[] = [];
  for (const b of brands) {
    if (b.website) urls.push(b.website);
  }
  if (opts.parentWebsite) urls.push(opts.parentWebsite);
  if (isSeed) {
    for (const u of opts.seedUrls ?? []) {
      if (u) urls.push(u);
    }
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of urls) {
    const key = u.replace(/\/+$/, "").toLowerCase();
    if (!u || seen.has(key)) continue;
    seen.add(key);
    out.push(u);
  }
  return out;
}

export function brandSlugForUrl(url: string, sites: FamilySite[]): string | undefined {
  const h = hostOf(url);
  if (!h) return undefined;
  const hit = sites.find((s) => {
    const sh = hostOf(s.website);
    return sh && (h === sh || h.endsWith(`.${sh}`) || sh.endsWith(`.${h}`));
  });
  return hit?.slug;
}

export function findingFitsFamilyRules(code: string, ruleCodes: string[]): boolean {
  if (!ruleCodes.length) return true;
  if (ruleCodes.includes(code)) return true;
  return SYSTEM_RULE_SET.has(code);
}
