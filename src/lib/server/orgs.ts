import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { extractJsonLd } from "@/lib/html/jsonld";
import { extractHeadings } from "@/lib/html/semantic";
import {
  SEED_BRANDS,
  SEED_PARENT,
  SYSTEM_RULE_CODES,
  computeCoverage,
  hostOf,
  missingForNewOrg,
  parseRuleCodes,
  slugify,
  normalizeProductList,
  brandSeedRules,
  isSystemRule,
  type OrgProbe,
  type StudioOrg,
} from "@/lib/org/catalog";
import { RULE_CODES } from "@/data/rules-seed";
import { parseWebsite, validateOrgName } from "@/lib/org/family-form";
import { PRODUCT_LABEL, type ProductId } from "@/lib/graph/types";

const FETCH_HEADERS = { "user-agent": "OriginStudio/1.0 (+content-graph)" };

function parseProducts(raw: string): string[] {
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function parseProbe(raw: string): OrgProbe {
  try {
    return JSON.parse(raw) as OrgProbe;
  } catch {
    return {};
  }
}

function rowToOrg(r: {
  id: string;
  slug: string;
  name: string;
  kind: string;
  parent_id: string | null;
  website: string;
  host: string;
  products_json: string;
  probe_json: string;
  include_in_graph: number;
  rules_json?: string;
}): StudioOrg {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    kind: r.kind === "parent" ? "parent" : "brand",
    parentId: r.parent_id,
    website: r.website,
    host: r.host,
    products: parseProducts(r.products_json),
    probe: parseProbe(r.probe_json),
    includeInGraph: r.include_in_graph !== 0,
    ruleCodes: parseRuleCodes(r.rules_json),
  };
}

async function fetchText(url: string, timeoutMs = 12_000): Promise<string> {
  const res = await fetch(url, { headers: FETCH_HEADERS, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  return res.text();
}

function absUrl(input: string): string {
  const parsed = parseWebsite(input);
  if (!parsed.ok) throw new Error(parsed.error);
  if (parsed.empty) throw new Error("URL required");
  return parsed.url;
}

const PRODUCT_HINTS: Array<[ProductId, RegExp]> = [
  ["debt-relief", /debt[- ]?relief/i],
  ["settlement", /settlement/i],
  ["heloc", /heloc|home-equity-line/i],
  ["hel", /home[- ]equity[- ]loan|\bhel\b/i],
  ["personal-loan", /personal[- ]loan/i],
  ["consolidation", /consolidat/i],
  ["glossary", /glossary/i],
];

function detectProducts(html: string, paths: string[]): string[] {
  const blob = `${html} ${paths.join(" ")}`.toLowerCase();
  const found: string[] = [];
  for (const [id, re] of PRODUCT_HINTS) {
    if (re.test(blob)) found.push(id);
  }
  return found;
}

function locs(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/g)].map((m) => m[1]!.trim());
}

async function probeUrl(url: string): Promise<OrgProbe> {
  const homeUrl = absUrl(url);
  const origin = new URL(homeUrl).origin;
  const html = (await fetchText(homeUrl)).slice(0, 400_000);
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
  const h1 = extractHeadings(html).find((h) => h.level === 1 && !h.inFooter)?.text ?? "";
  const canonical =
    html.match(/rel=["']canonical["'][^>]*href=["']([^"']+)/i)?.[1] ??
    html.match(/href=["']([^"']+)["'][^>]*rel=["']canonical["']/i)?.[1] ??
    "";
  const jsonld = extractJsonLd(html);
  const orgNode = jsonld.nodes.find((n) => n.types.some((t) => /organization/i.test(t)));
  const schemaTypes = [...new Set(jsonld.nodes.flatMap((n) => n.types))].slice(0, 12);

  let sitemapUrl = "";
  let pageCount = 0;
  const samplePaths: string[] = [];
  try {
    const robots = await fetchText(`${origin}/robots.txt`, 6000);
    sitemapUrl = robots.match(/sitemap:\s*(\S+)/i)?.[1] ?? "";
  } catch {
    /* optional */
  }
  if (!sitemapUrl) {
    for (const guess of [`${origin}/sitemap.xml`, `${origin}/sitemap-index.xml`]) {
      try {
        const xml = await fetchText(guess, 8000);
        if (xml.includes("<loc>")) {
          sitemapUrl = guess;
          break;
        }
      } catch {
        /* next */
      }
    }
  }
  if (sitemapUrl) {
    try {
      const xml = await fetchText(sitemapUrl, 10000);
      const found = locs(xml);
      const maps = found.filter((u) => u.endsWith(".xml")).slice(0, 8);
      const pages = new Set(found.filter((u) => !u.endsWith(".xml")));
      for (const map of maps) {
        try {
          for (const u of locs(await fetchText(map, 10000))) {
            if (!u.endsWith(".xml")) pages.add(u.split("#")[0]!);
          }
        } catch {
          /* skip one map */
        }
      }
      pageCount = pages.size;
      for (const u of pages) {
        try {
          samplePaths.push(new URL(u).pathname);
        } catch {
          samplePaths.push(u);
        }
        if (samplePaths.length >= 24) break;
      }
    } catch {
      /* sitemap optional */
    }
  }

  const products = detectProducts(html, samplePaths);
  return {
    fetchedAt: new Date().toISOString(),
    ok: true,
    title,
    h1,
    canonical,
    hasJsonLd: jsonld.nodes.length > 0,
    orgName: orgNode?.name || undefined,
    orgId: orgNode?.id || undefined,
    schemaTypes,
    sitemapUrl: sitemapUrl || undefined,
    pageCount,
    products,
    samplePaths,
  };
}

async function uniqueSlug(userId: string, base: string): Promise<string> {
  const sql = await getSql();
  let slug = base;
  let n = 2;
  for (;;) {
    const hit = await sql<{ n: number }>`
      select count(*)::int as n from studio_orgs where user_id = ${userId} and slug = ${slug}
    `;
    if ((hit[0]?.n ?? 0) === 0) return slug;
    slug = `${base}-${n}`;
    n += 1;
  }
}

export async function seedOrgs(userId: string) {
  const sql = await getSql();
  const n = await sql<{ n: number }>`select count(*)::int as n from studio_orgs where user_id = ${userId}`;
  const seedCodes = JSON.stringify([...RULE_CODES]);
  if ((n[0]?.n ?? 0) > 0) {
    await sql`
      update studio_orgs
      set rules_json = ${seedCodes}
      where user_id = ${userId} and slug = ${"pantheon"} and kind = ${"parent"}
        and (rules_json is null or rules_json = ${"[]"} or rules_json = ${""})
    `;
    return;
  }
  const parentId = `${userId}:org:pantheon`;
  await sql`
    insert into studio_orgs (id, user_id, slug, name, kind, parent_id, website, host, products_json, probe_json, include_in_graph, rules_json)
    values (
      ${parentId}, ${userId}, ${SEED_PARENT.slug}, ${SEED_PARENT.name}, ${"parent"}, ${null},
      ${SEED_PARENT.website}, ${""}, ${"[]"}, ${"{}"}, ${1}, ${seedCodes}
    )
    on conflict (id) do nothing
  `;
  for (const b of SEED_BRANDS) {
    const probe: OrgProbe = {
      ok: true,
      fetchedAt: "seed",
      title: b.name,
      orgName: b.name,
      orgId: `${b.website}#organization`,
      hasJsonLd: true,
      sitemapUrl: b.slug === "fdr" ? "https://www.freedomdebtrelief.com/sitemap-index.xml" : "https://www.achieve.com/sitemap.xml",
      pageCount: b.slug === "fdr" ? 1159 : 1114,
      products: [...b.products],
    };
    await sql`
      insert into studio_orgs (id, user_id, slug, name, kind, parent_id, website, host, products_json, probe_json, include_in_graph)
      values (
        ${`${userId}:org:${b.slug}`}, ${userId}, ${b.slug}, ${b.name}, ${"brand"}, ${parentId},
        ${b.website}, ${b.host}, ${JSON.stringify(b.products)}, ${JSON.stringify(probe)}, ${1}
      )
      on conflict (id) do nothing
    `;
  }
}

async function loadFamily(userId: string, parentId?: string | null) {
  const sql = await getSql();
  await seedOrgs(userId);
  const parents = await sql<{
    id: string;
    slug: string;
    name: string;
    kind: string;
    parent_id: string | null;
    website: string;
    host: string;
    products_json: string;
    probe_json: string;
    include_in_graph: number;
    rules_json: string;
  }>`select id, slug, name, kind, parent_id, website, host, products_json, probe_json, include_in_graph, coalesce(rules_json, '[]') as rules_json
     from studio_orgs where user_id = ${userId} and kind = 'parent' order by created_at`;
  const all = await sql<{
    id: string;
    slug: string;
    name: string;
    kind: string;
    parent_id: string | null;
    website: string;
    host: string;
    products_json: string;
    probe_json: string;
    include_in_graph: number;
    rules_json: string;
  }>`select id, slug, name, kind, parent_id, website, host, products_json, probe_json, include_in_graph, coalesce(rules_json, '[]') as rules_json
     from studio_orgs where user_id = ${userId} order by kind desc, created_at`;
  const orgs = all.map(rowToOrg);
  const parentList = parents.map(rowToOrg);
  const active = parentId
    ? parentList.find((p) => p.id === parentId) ?? parentList[0] ?? null
    : parentList[0] ?? null;
  const brands = orgs.filter((o) => o.kind === "brand" && (!active || o.parentId === active.id));
  const allBrands = orgs.filter((o) => o.kind === "brand");
  const codes = active?.ruleCodes ?? [];
  return {
    parents: parentList,
    parent: active,
    brands,
    allBrands,
    orgs,
    coverage: computeCoverage(active, brands, codes),
    missing: missingForNewOrg(codes, brands, active?.slug),
    systemCodes: [...SYSTEM_RULE_CODES],
    ruleCodes: codes,
  };
}

export const listOrgs = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ parentId: z.string().optional() }).optional())
  .handler(async ({ context, data }) => loadFamily(context.userId, data?.parentId));

const parentInput = z
  .object({
    name: z.string().max(120),
    website: z.string().max(300).optional(),
    includeInGraph: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    const nameErr = validateOrgName(data.name, "parent");
    if (nameErr) ctx.addIssue({ code: "custom", message: nameErr, path: ["name"] });
    const site = parseWebsite(data.website ?? "");
    if (!site.ok) ctx.addIssue({ code: "custom", message: site.error, path: ["website"] });
  });

export const createParent = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(parentInput)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await seedOrgs(context.userId);
    const slug = await uniqueSlug(context.userId, slugify(data.name));
    const id = `${context.userId}:org:${slug}`;
    let website = (data.website ?? "").trim();
    let probe: OrgProbe = {};
    if (website) {
      website = absUrl(website);
      probe = await probeUrl(website);
    }
    await sql`
      insert into studio_orgs (id, user_id, slug, name, kind, parent_id, website, host, products_json, probe_json, include_in_graph, rules_json)
      values (
        ${id}, ${context.userId}, ${slug}, ${data.name.trim()}, ${"parent"}, ${null},
        ${website}, ${hostOf(website)}, ${"[]"}, ${JSON.stringify(probe)}, ${data.includeInGraph === false ? 0 : 1}, ${"[]"}
      )
    `;
    return loadFamily(context.userId, id);
  });

const brandInput = z
  .object({
    parentId: z.string().min(1),
    name: z.string().max(120),
    website: z.string().max(300),
    retrieve: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    const nameErr = validateOrgName(data.name, "brand");
    if (nameErr) ctx.addIssue({ code: "custom", message: nameErr, path: ["name"] });
    const site = parseWebsite(data.website ?? "");
    if (!site.ok) ctx.addIssue({ code: "custom", message: site.error, path: ["website"] });
    else if (site.empty) ctx.addIssue({ code: "custom", message: "Add this brand's website", path: ["website"] });
  });

export const addBrand = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(brandInput)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const parent = await sql<{ id: string }>`
      select id from studio_orgs where id = ${data.parentId} and user_id = ${context.userId} and kind = 'parent' limit 1
    `;
    if (!parent[0]) throw new Error("Parent company not found");
    let website = (data.website ?? "").trim();
    let probe: OrgProbe = {};
    let products: string[] = [];
    let name = data.name.trim();
    if (data.retrieve && website) {
      website = absUrl(website);
      probe = await probeUrl(website);
      products = probe.products ?? [];
      if (!name || name === website) name = probe.orgName || probe.title?.split("|")[0]?.trim() || name;
    } else if (website) {
      website = absUrl(website);
    }
    const slug = await uniqueSlug(context.userId, slugify(name));
    const id = `${context.userId}:org:${slug}`;
    await sql`
      insert into studio_orgs (id, user_id, slug, name, kind, parent_id, website, host, products_json, probe_json, include_in_graph)
      values (
        ${id}, ${context.userId}, ${slug}, ${name}, ${"brand"}, ${data.parentId},
        ${website}, ${hostOf(website)}, ${JSON.stringify(products)}, ${JSON.stringify(probe)}, ${1}
      )
    `;
    return loadFamily(context.userId, data.parentId);
  });

export const probeWebsite = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({ url: z.string().max(300) }).superRefine((data, ctx) => {
      const site = parseWebsite(data.url);
      if (!site.ok) ctx.addIssue({ code: "custom", message: site.error, path: ["url"] });
      else if (site.empty) ctx.addIssue({ code: "custom", message: "Paste a website first", path: ["url"] });
    }),
  )
  .handler(async ({ data }) => {
    try {
      const probe = await probeUrl(data.url);
      const guessedName = probe.orgName || probe.title?.split("|")[0]?.trim() || hostOf(data.url);
      return { ok: true as const, probe, guessedName, host: hostOf(absUrl(data.url)), website: absUrl(data.url) };
    } catch (e) {
      return {
        ok: false as const,
        probe: { ok: false, error: e instanceof Error ? e.message : "Retrieve failed" } satisfies OrgProbe,
        guessedName: "",
        host: "",
        website: data.url,
      };
    }
  });

export const setIncludeParent = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ parentId: z.string().min(1), include: z.boolean() }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await sql`
      update studio_orgs set include_in_graph = ${data.include ? 1 : 0}
      where id = ${data.parentId} and user_id = ${context.userId} and kind = 'parent'
    `;
    return loadFamily(context.userId, data.parentId);
  });

export const retrieveBrand = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string().min(1) }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      website: string;
      parent_id: string | null;
      name: string;
      products_json: string;
    }>`select id, website, parent_id, name, products_json from studio_orgs where id = ${data.id} and user_id = ${context.userId} limit 1`;
    const row = rows[0];
    if (!row?.website) throw new Error("Add a website first");
    const probe = await probeUrl(row.website);
    const products = normalizeProductList([...(parseProducts(row.products_json)), ...(probe.products ?? [])]);
    const name = probe.orgName || row.name;
    await sql`
      update studio_orgs
      set probe_json = ${JSON.stringify(probe)},
          products_json = ${JSON.stringify(products)},
          host = ${hostOf(row.website)},
          name = ${name}
      where id = ${row.id} and user_id = ${context.userId}
    `;
    return loadFamily(context.userId, row.parent_id);
  });

export const setBrandProducts = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      brandId: z.string().min(1),
      products: z.array(z.string().max(80)).max(24),
    }),
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const rows = await sql<{ id: string; parent_id: string | null }>`
      select id, parent_id from studio_orgs
      where id = ${data.brandId} and user_id = ${context.userId} and kind = 'brand' limit 1
    `;
    const row = rows[0];
    if (!row) throw new Error("Brand not found");
    const products = normalizeProductList(data.products);
    await sql`
      update studio_orgs set products_json = ${JSON.stringify(products)}
      where id = ${row.id} and user_id = ${context.userId}
    `;
    return loadFamily(context.userId, row.parent_id);
  });

async function ensureRuleRows(userId: string, codes: string[]) {
  const { RULES, ruleStatement, ruleCheckJson } = await import("@/data/rules-seed");
  const sql = await getSql();
  const existing = await sql<{ code: string }>`select code from studio_rules where user_id = ${userId}`;
  const have = new Set(existing.map((r) => r.code));
  let added = 0;
  for (const code of codes) {
    if (have.has(code)) continue;
    const r = RULES.find((x) => x.code === code);
    if (!r) continue;
    const domain = SYSTEM_RULE_CODES.includes(code as (typeof SYSTEM_RULE_CODES)[number]) ? "system" : r.domain;
    const id = `${userId}:${r.id}`;
    await sql`
      insert into studio_rules (id, user_id, code, title, layer, domain, product, statement, check_json)
      values (${id}, ${userId}, ${r.code}, ${r.title}, ${r.layer}, ${domain}, ${r.product}, ${ruleStatement(r)}, ${ruleCheckJson(r.code)})
      on conflict (id) do nothing
    `;
    added += 1;
    have.add(code);
  }
  return added;
}

async function mergeParentRules(userId: string, parentId: string, codes: string[]) {
  const sql = await getSql();
  const rows = await sql<{ id: string; rules_json: string }>`
    select id, coalesce(rules_json, '[]') as rules_json from studio_orgs
    where id = ${parentId} and user_id = ${userId} and kind = 'parent' limit 1
  `;
  const row = rows[0];
  if (!row) throw new Error("Parent company not found");
  const next = [...new Set([...parseRuleCodes(row.rules_json), ...codes])];
  await sql`update studio_orgs set rules_json = ${JSON.stringify(next)} where id = ${row.id}`;
  const catalogAdded = await ensureRuleRows(userId, codes);
  return { attached: codes.filter((c) => !parseRuleCodes(row.rules_json).includes(c)).length, catalogAdded };
}

export const attachSystemRules = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ parentId: z.string().min(1) }))
  .handler(async ({ context, data }) => {
    const result = await mergeParentRules(context.userId, data.parentId, [...SYSTEM_RULE_CODES]);
    const family = await loadFamily(context.userId, data.parentId);
    return { added: result.attached, ...family };
  });

export const attachBrandRules = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ parentId: z.string().min(1), codes: z.array(z.string().min(1)).min(1).max(40) }))
  .handler(async ({ context, data }) => {
    const family = await loadFamily(context.userId, data.parentId);
    const seed =
      family.parent?.slug === SEED_PARENT.slug ||
      family.brands.some((b) => SEED_BRANDS.some((s) => s.slug === b.slug));
    if (!seed) {
      throw new Error("Brand seed rules stay on the Pantheon family. Write a new rule on the Rules tab.");
    }
    const allowed = new Set(brandSeedRules().map((r) => r.code));
    const codes = [...new Set(data.codes.filter((c) => allowed.has(c)))];
    if (!codes.length) throw new Error("Pick a brand rule from the seed set");
    const result = await mergeParentRules(context.userId, data.parentId, codes);
    const next = await loadFamily(context.userId, data.parentId);
    return { added: result.attached, ...next };
  });

export const attachFamilyRules = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      parentId: z.string().min(1),
      codes: z.array(z.string().min(1).max(16)).min(1).max(20),
    }),
  )
  .handler(async ({ context, data }) => {
    const family = await loadFamily(context.userId, data.parentId);
    const seed =
      family.parent?.slug === SEED_PARENT.slug ||
      family.brands.some((b) => SEED_BRANDS.some((s) => s.slug === b.slug));
    const seedBrand = new Set(brandSeedRules().map((r) => r.code));
    const codes = [...new Set(data.codes.map((c) => c.trim()).filter(Boolean))].filter((c) => {
      if (seed || isSystemRule(c)) return true;
      return !seedBrand.has(c);
    });
    if (!codes.length) throw new Error("That rule belongs to another family");
    const result = await mergeParentRules(context.userId, data.parentId, codes);
    const next = await loadFamily(context.userId, data.parentId);
    return { added: result.attached, ...next };
  });

export const productHintLabel = (p: string) =>
  p in PRODUCT_LABEL ? PRODUCT_LABEL[p as ProductId] : p.replace(/-/g, " ");
