#!/usr/bin/env node
/**
 * Recrawl FDR + Achieve + Bills sitemaps into src/data/crawl.json
 * (and public/data/crawl.json) matching the existing CrawlSnapshot schema.
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const SOURCES = {
  fdr: "https://www.freedomdebtrelief.com/sitemap-index.xml",
  achieve: "https://www.achieve.com/sitemap.xml",
  bills: "https://www.bills.com/sitemap-index.xml",
};

const HOSTS = {
  fdr: "www.freedomdebtrelief.com",
  achieve: "www.achieve.com",
  bills: "www.bills.com",
};

const UA = "OriginStudio/1.0 (+content-graph-recrawl)";
const FETCH_TIMEOUT_MS = 45_000;

function locs(xml) {
  return [...xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)].map((m) => m[1].trim());
}

function isSitemapUrl(url) {
  return /sitemap/i.test(url) && /\.xml(\.gz)?(\?|$)/i.test(url);
}

async function fetchText(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA, accept: "application/xml,text/xml,*/*" },
      signal: ctrl.signal,
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

async function collectUrls(seed, brand, seenSitemaps = new Set(), depth = 0) {
  if (depth > 6 || seenSitemaps.has(seed)) return [];
  seenSitemaps.add(seed);
  let xml;
  try {
    xml = await fetchText(seed);
  } catch (e) {
    console.warn(`[${brand}] fail ${seed}: ${e.message}`);
    return [];
  }
  const found = locs(xml);
  const pageUrls = [];
  const childSitemaps = [];
  for (const u of found) {
    if (isSitemapUrl(u) && u !== seed) childSitemaps.push(u);
    else pageUrls.push(u);
  }
  // Also treat index-style docs that nest sitemaps without .xml in path ending
  if (found.length && found.every((u) => isSitemapUrl(u) || /sitemap/i.test(u))) {
    for (const u of found) {
      if (!pageUrls.includes(u) && !childSitemaps.includes(u) && u !== seed) childSitemaps.push(u);
    }
  }
  const out = [...pageUrls];
  // Parallel-ish batches
  const batch = 6;
  for (let i = 0; i < childSitemaps.length; i += batch) {
    const slice = childSitemaps.slice(i, i + batch);
    const nested = await Promise.all(slice.map((s) => collectUrls(s, brand, seenSitemaps, depth + 1)));
    for (const n of nested) out.push(...n);
  }
  return out;
}

function pathOf(url, host) {
  try {
    const u = new URL(url);
    if (!u.hostname.replace(/^www\./, "").endsWith(host.replace(/^www\./, ""))) return null;
    let path = u.pathname || "/";
    // Keep trailing slash style consistent with prior crawl: preserve as in URL, but normalize empty
    if (path === "/") return "";
    return path;
  } catch {
    return null;
  }
}

/** Product classifiers similar to orgs.ts PRODUCT_HINTS + marketplace extras. */
function classifyProduct(path) {
  const pl = path.toLowerCase();
  if (/\/glossary(\/|$)/.test(pl) || pl === "/glossary") return "glossary";
  if (/heloc|home-equity-line/.test(pl)) return "heloc";
  if (/home[- ]?equity/.test(pl) || /(^|\/)hel(\/|$)/.test(pl)) return "hel";
  if (/personal[-_ ]?loan/.test(pl)) return "personal-loan";
  if (/settlement/.test(pl)) return "settlement";
  if (/consolidat|debtconsolidation/.test(pl)) return "consolidation";
  if (/debt[- ]?relief|debtrelief|freedom-debt-relief/.test(pl)) return "debt-relief";
  if (/(^|\/)credit-cards(\/|$)/.test(pl)) return "credit-cards";
  if (/student[- ]?loans?/.test(pl)) return "student-loans";
  if (/(^|\/)insurance(\/|$)/.test(pl)) return "insurance";
  if (/wellness|well-being|financial-health|mental-health|debt-stress|financial-stress/.test(pl))
    return "wellness";
  return "other";
}

function classifyKind(path, product) {
  const pl = path.toLowerCase();
  if (product === "glossary" || /\/glossary(\/|$)/.test(pl)) return "g";
  if (/\/authors?(\/|$)/.test(pl)) return "u";
  if (/near-me|\/reviews(\/|$)/.test(pl)) return "r";
  // Achieve short landing /l/ and branded product hubs stay product
  if (/^\/(learn|blog|resources|best|personal-finance)(\/|$)/.test(pl)) return "a";
  if (/learn-more-about/.test(pl)) return "a";
  // FDR debt-relief state/city-ish under /debt-relief/ with deeper paths often regional
  if (/^\/debt-relief\/.+/.test(pl) && pl.split("/").filter(Boolean).length >= 2) {
    // keep article-like under learn already handled; remaining deep debt-relief often regional (r)
    if (!/can-you-|pros-and-cons|how-to|what-is|vs-/.test(pl)) return "r";
  }
  return "p";
}

function glossarySlug(path) {
  // /glossary/a/amortization/ or /glossary/a/amortization
  const m = path.toLowerCase().match(/\/glossary\/(?:[a-z0-9]\/)?([^/]+)\/?$/);
  if (!m) return null;
  if (m[1] === "glossary" || m[1].length === 1) return null;
  return m[1];
}

function nearSlug(a, b) {
  if (a === b) return false;
  // simple near: one contains the other with small edit, or share long prefix
  const min = Math.min(a.length, b.length);
  if (min < 6) return false;
  if (a.includes(b) || b.includes(a)) {
    return Math.abs(a.length - b.length) <= 12;
  }
  let i = 0;
  while (i < min && a[i] === b[i]) i++;
  return i >= 10 && Math.abs(a.length - b.length) <= 8;
}

async function main() {
  const crawledAt = new Date().toISOString();
  const byBrand = {};
  const errors = [];

  for (const [brand, seed] of Object.entries(SOURCES)) {
    console.log(`Crawling ${brand} from ${seed}…`);
    const urls = await collectUrls(seed, brand);
    const host = HOSTS[brand];
    const pages = [];
    const seenPath = new Set();
    for (const url of urls) {
      const path = pathOf(url, host);
      if (path == null) continue;
      if (seenPath.has(path)) continue;
      seenPath.add(path);
      const p = classifyProduct(path);
      const k = classifyKind(path, p);
      pages.push({ b: brand, k, p, path });
    }
    // Always include homepage
    if (!seenPath.has("")) {
      pages.unshift({ b: brand, k: "p", p: "other", path: "" });
    }
    pages.sort((a, b) => a.path.localeCompare(b.path));
    byBrand[brand] = pages;
    console.log(`  ${brand}: ${pages.length} pages (${urls.length} locs raw)`);
  }

  const pages = [...byBrand.fdr, ...byBrand.achieve, ...byBrand.bills];

  // Glossary overlap FDR ↔ Achieve
  const fdrGloss = new Map();
  const achGloss = new Map();
  for (const page of byBrand.fdr) {
    if (page.p !== "glossary") continue;
    const slug = glossarySlug(page.path);
    if (slug) fdrGloss.set(slug, `https://www.freedomdebtrelief.com${page.path.endsWith("/") || page.path === "" ? page.path : page.path + "/"}`);
  }
  for (const page of byBrand.achieve) {
    if (page.p !== "glossary") continue;
    const slug = glossarySlug(page.path);
    if (slug) achGloss.set(slug, `https://www.achieve.com${page.path}`);
  }
  // Normalize achieve URLs without forcing trailing slash (match prior style)
  const glossaryOverlap = [];
  for (const [slug, fdr] of [...fdrGloss.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (achGloss.has(slug)) {
      glossaryOverlap.push({ slug, fdr, achieve: achGloss.get(slug) });
    }
  }

  const glossaryNear = [];
  const fdrSlugs = [...fdrGloss.keys()];
  const achSlugs = [...achGloss.keys()];
  const used = new Set(glossaryOverlap.map((g) => g.slug));
  for (const fs of fdrSlugs) {
    if (used.has(fs)) continue;
    for (const as of achSlugs) {
      if (used.has(as)) continue;
      if (nearSlug(fs, as)) {
        glossaryNear.push({
          fdr_slug: fs,
          ach_slug: as,
          fdr: fdrGloss.get(fs),
          achieve: achGloss.get(as),
        });
        break;
      }
    }
  }
  glossaryNear.sort((a, b) => a.fdr_slug.localeCompare(b.fdr_slug));

  const snapshot = {
    crawledAt,
    source: { ...SOURCES },
    counts: {
      fdr: byBrand.fdr.length,
      achieve: byBrand.achieve.length,
      bills: byBrand.bills.length,
    },
    pages,
    glossaryOverlap,
    glossaryNear: glossaryNear.slice(0, 40),
  };

  const json = JSON.stringify(snapshot);
  const outSrc = join(root, "src/data/crawl.json");
  const outPub = join(root, "public/data/crawl.json");
  writeFileSync(outSrc, json);
  writeFileSync(outPub, json);
  console.log(
    `Wrote crawl.json · ${pages.length} pages · overlap ${glossaryOverlap.length} · near ${snapshot.glossaryNear.length} · at ${crawledAt}`,
  );
  console.log("counts", snapshot.counts);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
