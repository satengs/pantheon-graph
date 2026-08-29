import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { RULES, DEFAULT_BRAND_CONFIG } from "@/data/rules-seed";
import { analyzeHtml, SEED_HTML, type HtmlFinding } from "@/lib/html/semantic";
import { analyzeJsonLd, extractJsonLd, type JsonLdCheck } from "@/lib/html/jsonld";
import { persistFindings } from "@/lib/server/analyze-page";
import { analyzeArticleSignals } from "@/lib/html/article-signals";
import { analyzeHelSilo } from "@/lib/html/hel-silo";
import { validateCrawl } from "@/lib/studio/crawl-validate";
import type { BrandId, CrawlPage, ProductId } from "@/lib/graph/types";
import { BRAND_HOST } from "@/lib/graph/types";
import { parseRuleCodes } from "@/lib/org/catalog";
import { brandSlugForUrl, familyIsSeed, findingFitsFamilyRules, recheckTargets, type FamilySite } from "@/lib/org/family-validate";

const FETCH_HEADERS = { "user-agent": "OriginStudio/1.0 (+content-graph)" };

export type RuleScope = string;

const scopeSchema = z.string().min(1);

function ruleApplies(domain: string, scope: RuleScope): boolean {
  if (scope === "all") return true;
  if (scope === "common" || scope === "system") return domain === "both" || domain === "system";
  return domain === scope || domain === "both" || domain === "system";
}

function pageUrl(page: CrawlPage): string {
  const host = BRAND_HOST[page.b];
  return `${host}${page.path.startsWith("/") ? page.path : `/${page.path}`}`;
}

function pickValidationUrls(
  pages: CrawlPage[],
  extra: string[],
  overlap: Array<{ fdr: string; achieve: string }>,
  brand: "all" | BrandId,
  product: "all" | ProductId | string,
  limit = 16,
): string[] {
  const out = new Set<string>(extra.filter(Boolean));
  const seen = new Set<string>();
  for (const p of pages) {
    if (brand !== "all" && p.b !== brand) continue;
    if (product !== "all" && p.p !== product) continue;
    const key = `${p.b}:${p.p}:${p.k}`;
    if (seen.has(key)) continue;
    if (p.k === "p" || p.k === "g" || p.k === "a") {
      seen.add(key);
      out.add(pageUrl(p));
    }
    if (out.size >= limit) break;
  }
  for (const pair of overlap.slice(0, 3)) {
    if (out.size >= limit) break;
    if (brand === "all" || brand === "fdr") out.add(pair.fdr);
    if (brand === "all" || brand === "achieve") out.add(pair.achieve);
  }
  return [...out].slice(0, limit);
}

async function loadConfigs(userId: string): Promise<Record<string, { schemaOrg?: string }>> {
  try {
    const sql = await getSql();
    const rows = await sql<{ brand: string; json: string }>`
      select brand, json from studio_configs where user_id = ${userId}
    `;
    const out: Record<string, { schemaOrg?: string }> = {
      fdr: DEFAULT_BRAND_CONFIG.fdr,
      achieve: DEFAULT_BRAND_CONFIG.achieve,
    };
    for (const r of rows) {
      try {
        out[r.brand] = JSON.parse(r.json) as { schemaOrg?: string };
      } catch {
        /* keep default */
      }
    }
    return out;
  } catch {
    return { fdr: DEFAULT_BRAND_CONFIG.fdr, achieve: DEFAULT_BRAND_CONFIG.achieve };
  }
}

async function loadSnapshot(userId: string, url: string): Promise<string | null> {
  try {
    const sql = await getSql();
    const rows = await sql<{ html: string }>`
      select html from studio_snapshots where user_id = ${userId} and url = ${url} limit 1
    `;
    return rows[0]?.html ?? null;
  } catch {
    return null;
  }
}

export async function saveSnapshot(userId: string, url: string, html: string) {
  try {
    const sql = await getSql();
    const jsonld = JSON.stringify(extractJsonLd(html).nodes.map((n) => ({ id: n.id, types: n.types })));
    const id = `${userId}:${encodeURIComponent(url)}`;
    await sql`
      insert into studio_snapshots (id, user_id, url, html, jsonld, fetched_at)
      values (${id}, ${userId}, ${url}, ${html}, ${jsonld}, now())
      on conflict (id) do update set html = excluded.html, jsonld = excluded.jsonld, fetched_at = now()
    `;
  } catch {
    /* preview without the table still validates */
  }
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, { headers: FETCH_HEADERS, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Fetch ${url} ${res.status}`);
  return (await res.text()).slice(0, 400_000);
}

function runEngines(
  html: string,
  url: string,
  opts: { brand?: BrandId | "all"; product?: ProductId | "all"; orgId?: string; checks: JsonLdCheck[] },
): HtmlFinding[] {
  return [...analyzeHtml(html, url), ...analyzeJsonLd(html, url, opts), ...analyzeArticleSignals(html, url), ...analyzeHelSilo(html, url)];
}

const checksFromScope: JsonLdCheck[] = ["exists", "org", "type", "props"];

export const validateLiveUrl = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      url: z.string().url(),
      scope: scopeSchema.default("all"),
      live: z.boolean().optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    const userId = context.userId;
    const configs = await loadConfigs(userId);
    let html = data.live ? null : await loadSnapshot(userId, data.url);
    let source: "snapshot" | "live" | "seed" = "snapshot";
    if (!html) {
      html = SEED_HTML[data.url] ?? null;
      if (html) source = "seed";
    }
    if (!html || data.live) {
      html = await fetchHtml(data.url);
      source = "live";
      await saveSnapshot(userId, data.url, html);
    }
    const brand: BrandId | "all" = data.url.includes("achieve.com") ? "achieve" : "fdr";
    const orgId = configs[brand]?.schemaOrg;
    const findings = runEngines(html, data.url, { brand, orgId, checks: checksFromScope }).filter((f) => {
      const rule = RULES.find((r) => r.code === f.code);
      if (!rule) return true;
      return ruleApplies(rule.domain, data.scope);
    });
    const codes = [...new Set(findings.map((f) => f.code))];
    try {
      const sql = await getSql();
      await sql`delete from studio_findings where user_id = ${userId} and url = ${data.url} and code in ('H1','TITLE','S05','S07','S08','S21','S27','S28','S29','S30','S31','S32')`;
    } catch {
      /* still return */
    }
    await persistFindings(userId, findings);
    return {
      url: data.url,
      source,
      fail: findings.length,
      findings,
      codes,
      jsonld: extractJsonLd(html).nodes.map((n) => ({ id: n.id, types: n.types, name: n.name })),
    };
  });

export const runValidation = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      scope: scopeSchema.default("all"),
      brand: z.string().default("all"),
      product: z.string().default("all"),
      live: z.boolean().optional(),
      limit: z.number().int().min(1).max(24).optional(),
      parentId: z.string().optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    const userId = context.userId;
    const configs = await loadConfigs(userId);
    const { crawl } = await import("@/data/crawl");
    let familySites: FamilySite[] = [];
    let parentSlug = "";
    let parentWebsite = "";
    let parentId = data.parentId ?? "";
    let ruleCodes: string[] = [];
    try {
      const sql = await getSql();
      const parents = await sql<{ id: string; slug: string; website: string; rules_json: string }>`
        select id, slug, website, coalesce(rules_json, '[]') as rules_json
        from studio_orgs where user_id = ${userId} and kind = 'parent' order by created_at
      `;
      const sites = await sql<{ website: string; slug: string; parent_id: string | null }>`
        select website, slug, parent_id from studio_orgs
        where user_id = ${userId} and kind = 'brand' and website <> ''
      `;
      familySites = sites.map((s) => ({ slug: s.slug, website: s.website, parentId: s.parent_id }));
      const active = parentId ? parents.find((p) => p.id === parentId) : parents[0];
      parentId = active?.id ?? parentId;
      parentSlug = active?.slug ?? "";
      parentWebsite = active?.website ?? "";
      ruleCodes = parseRuleCodes(active?.rules_json);
    } catch {
      /* orgs table may be empty on first boot */
    }
    const brandSlugs = familySites.filter((s) => !parentId || s.parentId === parentId).map((s) => s.slug);
    const isSeed = familyIsSeed(parentSlug, brandSlugs) || (!parentId && !familySites.length);
    let extra = recheckTargets({
      parentId: parentId || undefined,
      parentSlug,
      parentWebsite,
      brands: familySites.filter((s) => data.brand === "all" || s.slug === data.brand),
      isSeed,
      seedUrls: isSeed ? RULES.flatMap((r) => r.urls).slice(0, 12) : [],
    });
    const urls = pickValidationUrls(
      isSeed ? crawl.pages : [],
      extra,
      isSeed ? crawl.glossaryOverlap : [],
      data.brand,
      data.product,
      data.limit ?? 12,
    );
    const all: HtmlFinding[] = [];
    let usedLive = 0;
    let usedSnap = 0;
    const perUrl: Array<{ url: string; fail: number; source: string }> = [];

    if (isSeed) {
      const crawlFindings = validateCrawl(crawl).filter((f) => {
        const rule = RULES.find((r) => r.code === f.code);
        if (!rule) return true;
        if (!ruleApplies(rule.domain, data.scope)) return false;
        return findingFitsFamilyRules(f.code, ruleCodes);
      });
      all.push(...crawlFindings);
      await persistFindings(userId, crawlFindings);
      for (const f of crawlFindings) {
        perUrl.push({ url: f.url, fail: 1, source: "last-crawl" });
      }
    }

    for (const url of urls) {
      let html: string | null = null;
      let source = "seed";
      if (!data.live) html = await loadSnapshot(userId, url);
      if (html) {
        source = "snapshot";
        usedSnap += 1;
      } else if (SEED_HTML[url]) {
        html = SEED_HTML[url]!;
        source = "seed";
      } else if (usedLive < 8) {
        try {
          html = await fetchHtml(url);
          source = "live";
          usedLive += 1;
          await saveSnapshot(userId, url, html);
        } catch {
          html = null;
        }
      }
      if (!html) {
        perUrl.push({ url, fail: 0, source: "skipped" });
        continue;
      }
      if (source === "seed") await saveSnapshot(userId, url, html);
      const slug = brandSlugForUrl(url, familySites);
      const brand: BrandId = slug || (url.includes("achieve.com") ? "achieve" : url.includes("freedomdebtrelief") ? "fdr" : "all");
      const findings = runEngines(html, url, {
        brand,
        product: data.product === "all" ? "all" : (data.product as ProductId),
        orgId: configs[brand]?.schemaOrg,
        checks: checksFromScope,
      }).filter((f) => {
        const rule = RULES.find((r) => r.code === f.code);
        if (!rule) return findingFitsFamilyRules(f.code, ruleCodes);
        if (!ruleApplies(rule.domain, data.scope)) return false;
        return findingFitsFamilyRules(f.code, ruleCodes);
      });
      try {
        const sql = await getSql();
        await sql`delete from studio_findings where user_id = ${userId} and url = ${url} and code in ('H1','TITLE','S05','S07','S08','S21','S27','S28','S29','S30','S31','S32')`;
      } catch {
        /* continue */
      }
      await persistFindings(userId, findings);
      all.push(...findings);
      perUrl.push({ url, fail: findings.length, source });
    }

    try {
      const sql = await getSql();
      const summary = JSON.stringify({ pages: perUrl, fail: all.length, scope: data.scope });
      await sql`
        insert into studio_history (id, user_id, kind, label, bytes, rows, json)
        values (
          ${`${userId}:validate:${crypto.randomUUID()}`},
          ${userId},
          ${"validate"},
          ${`Checked ${perUrl.length} crawled pages · ${all.length} issues`},
          ${summary.length},
          ${all.length},
          ${summary}
        )
      `;
    } catch {
      /* history is optional */
    }

    return {
      pages: perUrl.length,
      fail: all.length,
      usedLive,
      usedSnap,
      findings: all,
      perUrl,
    };
  });
