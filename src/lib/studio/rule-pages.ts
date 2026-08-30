import { crawl, pageUrl } from "@/data/crawl";
import { ISSUE_PROOFS } from "@/data/issue-proofs";
import { RULE_SCOPE, RULE_TITLE, RULES } from "@/data/rules-seed";
import type { BacklogItem } from "@/lib/graph/types";
import { pagePath } from "@/lib/studio/issue-detail";
import { isOpenIssue } from "@/lib/studio/query";

export type CategoryPage = {
  url: string;
  path: string;
  note: string;
};

export type IssueCategory = {
  code: string;
  title: string;
  statement: string;
  impact: string;
  layer: string;
  pages: CategoryPage[];
};

export type FindingHit = {
  id: string;
  code: string;
  title: string;
  url: string;
  why?: string;
};

const HTML_TITLE: Record<string, string> = {
  H1: "Heading outline",
  TITLE: "Title tag",
  FAQ: "FAQ heading level",
  FOOT: "Footer vs main",
  NOFOOT: "Footer landmark",
  SKIP: "Skip / outline block",
  REL: "Related block",
};

const PAGE_CAP = 40;

function norm(url: string): string {
  return url.replace(/\/+$/, "").toLowerCase();
}

function addPage(out: CategoryPage[], seen: Set<string>, url: string, note: string) {
  const u = url.trim();
  if (!u.startsWith("http")) return;
  const key = norm(u);
  if (seen.has(key)) return;
  seen.add(key);
  if (out.length >= PAGE_CAP) return;
  out.push({ url: u, path: pagePath(u), note });
}

function crawlHits(code: string, out: CategoryPage[], seen: Set<string>) {
  if (code === "S01" || code === "S25") {
    const rows = code === "S01" ? crawl.glossaryOverlap : crawl.glossaryOverlap.filter((p) => /apr|mortgage|personal-loan|interest-rate|heloc|home-equity/i.test(p.slug));
    for (const p of rows) {
      addPage(out, seen, p.fdr, p.slug);
      addPage(out, seen, p.achieve, p.slug);
    }
    return;
  }
  if (code === "S23") {
    for (const p of crawl.pages) {
      if (p.b !== "fdr") continue;
      if (p.p !== "heloc" && p.p !== "hel" && p.p !== "personal-loan") continue;
      addPage(out, seen, pageUrl(p), p.p);
    }
    return;
  }
  if (code === "S26") {
    for (const p of crawl.pages) {
      if (p.b !== "achieve" || p.k !== "g") continue;
      addPage(out, seen, pageUrl(p), "glossary");
    }
    return;
  }
  if (code === "S22") {
    for (const p of crawl.pages) {
      if (p.p !== "debt-relief" || (p.k !== "r" && p.k !== "p")) continue;
      addPage(out, seen, pageUrl(p), p.b);
    }
  }
}

export function pagesForRule(rule: BacklogItem, findings: FindingHit[]): CategoryPage[] {
  const out: CategoryPage[] = [];
  const seen = new Set<string>();
  for (const u of rule.urls.slice(0, 1)) addPage(out, seen, u, rule.title);
  for (const c of rule.citations) {
    if (/related|do not edit/i.test(`${c.whyReal} ${c.location}`)) continue;
    addPage(out, seen, c.url, c.location || "");
  }
  for (const row of ISSUE_PROOFS[rule.code]?.rows ?? []) addPage(out, seen, row.url, row.h1);
  for (const f of findings) {
    if (f.code !== rule.code) continue;
    addPage(out, seen, f.url, f.title);
  }
  crawlHits(rule.code, out, seen);
  return out;
}

export function htmlCategories(findings: FindingHit[], used: Set<string>): IssueCategory[] {
  const byCode = new Map<string, CategoryPage[]>();
  const seenBy = new Map<string, Set<string>>();
  for (const f of findings) {
    if (used.has(f.code)) continue;
    if (!HTML_TITLE[f.code] && !f.code) continue;
    if (!HTML_TITLE[f.code] && RULES.some((r) => r.code === f.code)) continue;
    const pages = byCode.get(f.code) ?? [];
    const seen = seenBy.get(f.code) ?? new Set<string>();
    addPage(pages, seen, f.url, f.title);
    byCode.set(f.code, pages);
    seenBy.set(f.code, seen);
  }
  return [...byCode.entries()].map(([code, pages]) => ({
    code,
    title: HTML_TITLE[code] ?? code,
    statement: pages[0]?.note || "HTML finding on these pages.",
    impact: "high",
    layer: "L1",
    pages,
  }));
}

export function issueCategories(findings: FindingHit[], rules: BacklogItem[] = RULES): IssueCategory[] {
  const open = rules.filter((r) => isOpenIssue(r.status));
  const used = new Set(open.map((r) => r.code));
  const cats: IssueCategory[] = open.map((r) => ({
    code: r.code,
    title: RULE_TITLE[r.code] ?? r.title,
    statement: RULE_SCOPE[r.code] ?? r.reason,
    impact: r.impact,
    layer: r.layer,
    pages: pagesForRule(r, findings),
  }));
  cats.push(...htmlCategories(findings, used));
  return cats.filter((c) => c.pages.length > 0);
}
