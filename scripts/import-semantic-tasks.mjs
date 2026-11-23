#!/usr/bin/env node
/**
 * Build public/data/semantic-tasks.json from the 24 Nov 2026 semantic HTML audit.
 * Keeps every finding. Maps affected URLs to graph node IDs (hub or brand).
 * Service owners are mapped from URLs/hubs onto Public, Loans, Apply, Enroll,
 * Dashboard, or Login. Accessibility / SEO from the audit are kept as tags.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..");
const DEFAULT_AUDIT = "/workspace/semantic-html-audit-2026-11-24.json";
const CRAWL = path.join(repo, "public/data/crawl.json");
const OUT = path.join(repo, "public/data/semantic-tasks.json");

const FDR_NOT_HUBS = new Set([
  "heloc",
  "hel",
  "personal-loan",
  "wellness",
  "credit-cards",
  "student-loans",
  "insurance",
]);

/** Hubs the seed family actually draws — keep Open in Graph on a real node. */
const SEED_PRODUCTS = {
  fdr: ["settlement", "debt-relief", "consolidation", "glossary", "apply"],
  achieve: ["personal-loan", "heloc", "hel", "wellness", "debt-relief", "glossary"],
  bills: ["consolidation", "hel", "heloc", "personal-loan", "credit-cards", "student-loans", "insurance"],
};

export function urlKey(url) {
  return String(url ?? "")
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/[?#].*$/, "")
    .replace(/\/+$/, "")
    .toLowerCase();
}

export function hubAllowed(brand, product) {
  if (!brand || !product) return false;
  if (brand === "fdr" && FDR_NOT_HUBS.has(product)) return false;
  if (brand === "achieve" && product === "settlement") return false;
  return product !== "other";
}

export function hubDrawn(brand, product) {
  return hubAllowed(brand, product) && (SEED_PRODUCTS[brand] ?? []).includes(product);
}

export function graphNodeId(brand, product) {
  if (hubDrawn(brand, product)) return `hub:${brand}:${product}`;
  return brand ? `brand:${brand}` : null;
}

export function brandOfHost(url) {
  const k = urlKey(url);
  if (k === "freedomdebtrelief.com" || k.startsWith("freedomdebtrelief.com/") || k.includes("apply.freedomdebtrelief.com"))
    return "fdr";
  if (k === "achieve.com" || k.startsWith("achieve.com/")) return "achieve";
  if (k === "bills.com" || k.startsWith("bills.com/")) return "bills";
  return null;
}

export const SERVICE_OWNERS = ["Public", "Loans", "Apply", "Enroll", "Dashboard", "Login"];

const LOAN_PREFIXES = [
  "/personal-loans",
  "/personal-loan",
  "/heloc",
  "/home-equity-loan",
  "/home-equity",
  "/home-loans",
  "/home-loan",
  "/loans",
  "/best/loans",
  "/rates/loans",
  "/rates/home-equity",
  "/reviews/loans",
  "/acceleration-loan",
  "/learn/personal-loans",
  "/learn/home-equity-loans",
  "/learn/home-equity",
  "/learn/heloc",
  "/learn/loans",
  "/learn/mortgages",
  "/mortgages",
  "/tools/heloc-payment-calculator",
  "/tools/heloc",
];

function pathMatches(path, prefix) {
  const p = String(path ?? "/").toLowerCase().replace(/\/+$/, "") || "/";
  const pre = prefix.toLowerCase().replace(/\/+$/, "");
  return p === pre || p.startsWith(`${pre}/`);
}

function urlPath(url) {
  try {
    return new URL(url).pathname || "/";
  } catch {
    return String(url ?? "/");
  }
}

function urlHost(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

/** Classify one URL into a canonical service team. */
export function classifyService(url) {
  const host = urlHost(url);
  const path = urlPath(url);
  if (/(^|\.)apply\./i.test(host) || pathMatches(path, "/apply")) return "Apply";
  if (pathMatches(path, "/enroll")) return "Enroll";
  if (
    pathMatches(path, "/login") ||
    pathMatches(path, "/signin") ||
    pathMatches(path, "/sign-in") ||
    pathMatches(path, "/sign_in") ||
    pathMatches(path, "/auth")
  ) {
    return "Login";
  }
  if (pathMatches(path, "/dashboard") || pathMatches(path, "/portal") || /^my\./i.test(host)) return "Dashboard";
  if (LOAN_PREFIXES.some((pre) => pathMatches(path, pre))) return "Loans";
  return "Public";
}

/** Accessibility / SEO from the audit owner, not used as the primary Service owner. */
export function disciplineTags(sourceOwner) {
  const tags = [];
  const s = String(sourceOwner ?? "");
  if (/\bAccessibility\b/i.test(s)) tags.push("Accessibility");
  if (/\bSEO\b/i.test(s)) tags.push("SEO");
  return tags;
}

/**
 * Primary service owner for a task: one service if every URL agrees; Loans only
 * when the task is scoped to loan pages; Public when public/editorial/shell
 * pages are in the set; otherwise a majority with a stable SERVICE_OWNERS tie-break.
 */
export function taskServiceOwner(urls) {
  const votes = new Map();
  for (const url of urls) {
    const s = classifyService(url);
    votes.set(s, (votes.get(s) ?? 0) + 1);
  }
  const services = [...votes.keys()];
  if (services.length === 1) return services[0];
  if (votes.has("Public")) return "Public";
  return SERVICE_OWNERS.filter((s) => votes.has(s)).sort((a, b) => (votes.get(b) ?? 0) - (votes.get(a) ?? 0) || SERVICE_OWNERS.indexOf(a) - SERVICE_OWNERS.indexOf(b))[0] ?? "Public";
}

export function buildCrawlIndex(crawl) {
  const byKey = new Map();
  for (const page of crawl.pages ?? []) {
    const host =
      page.b === "fdr"
        ? "freedomdebtrelief.com"
        : page.b === "achieve"
          ? "achieve.com"
          : page.b === "bills"
            ? "bills.com"
            : null;
    if (!host) continue;
    const pathPart = String(page.path ?? "").replace(/\/+$/, "").toLowerCase();
    const key = pathPart && pathPart !== "/" ? `${host}${pathPart.startsWith("/") ? pathPart : `/${pathPart}`}` : host;
    byKey.set(urlKey(`https://${key}`), page);
  }
  return byKey;
}

function scopeLabel(pageCount, brandAudited) {
  const n = Number(pageCount) || 0;
  const pages = n === 1 ? "1 page" : `${n} pages`;
  if (brandAudited && n >= brandAudited) return `${pages} · site-wide`;
  return pages;
}

function pickTaskGraphNode(urlNodes, brand) {
  const ids = [...new Set(urlNodes.map((u) => u.graphNodeId).filter(Boolean))];
  if (ids.length === 1) return ids[0];
  const hubs = ids.filter((id) => id.startsWith("hub:"));
  if (hubs.length === 1) return hubs[0];
  return brand ? `brand:${brand}` : ids[0] ?? null;
}

export function transformAudit(audit, crawl) {
  const meta = audit.meta ?? {};
  const totals = audit.totals ?? {};
  const index = buildCrawlIndex(crawl);
  const byBrand = meta.by_brand ?? totals.by_brand ?? {};

  const tasks = (audit.tasks ?? []).map((t) => {
    const brand = t.brand;
    const brandAudited = byBrand[brand]?.ok ?? byBrand[brand]?.selected ?? null;
    const affectedUrls = (t.affected_urls ?? []).map((u) => {
      const url = u.url || u.requested_url;
      const page = index.get(urlKey(url)) || index.get(urlKey(u.requested_url));
      const product = page?.p ?? u.hub ?? null;
      const b = page?.b ?? brand ?? brandOfHost(url);
      return {
        url,
        requestedUrl: u.requested_url ?? url,
        hub: u.hub ?? page?.p ?? null,
        section: u.section_label ?? u.section ?? null,
        countOnPage: u.count_on_page ?? null,
        inCrawl: Boolean(page),
        graphNodeId: graphNodeId(b, product),
      };
    });
    const examples = (t.examples ?? []).map((e) => ({
      url: e.url,
      hub: e.hub ?? null,
      section: e.section ?? null,
      selector: e.selector ?? "",
      snippet: e.snippet ?? "",
      countOnPage: e.count_on_page ?? null,
      variant: e.variant ?? null,
    }));
    const variants = (t.variants ?? []).map((v) =>
      typeof v === "string" ? { variant: v } : { variant: v.variant, pages: v.pages ?? null },
    );
    return {
      id: t.id,
      brand,
      brandLabel: t.brand_label,
      category: t.category,
      severity: t.severity,
      title: t.title,
      problem: t.problem,
      reason: t.reason,
      fix: t.fix,
      owner: taskServiceOwner((t.affected_urls ?? []).map((u) => u.url || u.requested_url)),
      sourceOwner: t.owner,
      tags: disciplineTags(t.owner),
      rule: t.rule,
      hubs: t.hubs ?? [],
      sections: t.sections ?? [],
      pageCount: t.page_count,
      occurrenceCount: t.occurrence_count,
      scopeLabel: scopeLabel(t.page_count, brandAudited),
      graphNodeId: pickTaskGraphNode(affectedUrls, brand),
      affectedUrls,
      examples,
      variants,
    };
  });

  const bySeverity = {
    critical: totals.by_severity?.critical ?? 0,
    high: totals.by_severity?.high ?? 0,
    medium: totals.by_severity?.medium ?? 0,
    low: totals.by_severity?.low ?? 0,
  };

  return {
    auditedAt: meta.audited_at,
    auditedAtLabel: "Audited 24 Nov 2026 · 156 URLs checked",
    pagesAudited: meta.pages_selected ?? totals.pages_selected ?? 0,
    htmlParsed: meta.pages_ok ?? totals.pages_ok ?? 0,
    nonHtmlCount: meta.pages_failed ?? totals.pages_failed ?? 0,
    timezone: meta.timezone ?? "Asia/Yerevan (UTC+4)",
    hosts: meta.hosts ?? {},
    notes: meta.notes ?? [],
    failures: (meta.failures ?? []).map((f) => ({
      brand: f.brand,
      url: f.final_url || f.requested_url,
      requestedUrl: f.requested_url,
      status: f.status ?? null,
      error: f.error ?? null,
    })),
    totals: {
      tasks: tasks.length,
      byBrand: {
        fdr: byBrand.fdr?.tasks ?? tasks.filter((t) => t.brand === "fdr").length,
        achieve: byBrand.achieve?.tasks ?? tasks.filter((t) => t.brand === "achieve").length,
        bills: byBrand.bills?.tasks ?? tasks.filter((t) => t.brand === "bills").length,
      },
      bySeverity,
    },
    tasks,
  };
}

export function assertCleanText(doc) {
  const blob = JSON.stringify(doc);
  if (blob.includes("/workspace/")) throw new Error("internal path leaked into semantic-tasks.json");
  return true;
}

function main() {
  const auditPath = process.argv[2] || process.env.SEMANTIC_AUDIT || DEFAULT_AUDIT;
  const audit = JSON.parse(fs.readFileSync(auditPath, "utf8"));
  const crawl = JSON.parse(fs.readFileSync(CRAWL, "utf8"));
  const doc = transformAudit(audit, crawl);
  assertCleanText(doc);
  if (doc.tasks.length !== 31) throw new Error(`expected 31 tasks, got ${doc.tasks.length}`);
  fs.writeFileSync(OUT, JSON.stringify(doc, null, 2) + "\n");
  const { totals } = doc;
  console.log(
    `wrote ${path.relative(repo, OUT)} · ${totals.tasks} tasks · FDR ${totals.byBrand.fdr} Achieve ${totals.byBrand.achieve} Bills ${totals.byBrand.bills} · C${totals.bySeverity.critical} H${totals.bySeverity.high} M${totals.bySeverity.medium} L${totals.bySeverity.low}`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
