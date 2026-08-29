import assert from "node:assert/strict";
import test from "node:test";
import {
  PAGE_LEVEL,
  brandForUrl,
  formatIssueDetail,
  formatIssueListRow,
  hasEvidence,
  issueSection,
  liveGate,
  pagePath,
} from "./issue-detail.ts";

const FDR = "https://www.freedomdebtrelief.com/glossary/d/debt-relief/";
const ACH = "https://www.achieve.com/heloc";

const issue = {
  id: "S01",
  code: "S01",
  title: "One canonical owner per glossary slug",
  reason: "Same slug on both origins. Each page canonicals to itself.",
  fix: "Pick one owner per slug. The non-owner must 301 or rel=canonical to the owner.",
  urls: [FDR, "https://www.achieve.com/glossary/d/debt-relief"],
  citations: [
    {
      url: FDR,
      brand: "fdr",
      quote: "rel=canonical self · H1 Debt Relief Meaning & Definition",
      location: "canonical + H1 + JSON-LD",
      whyReal: "Live self-canonical.",
    },
  ],
  domain: "both",
  product: "glossary",
  impact: "critical",
  layer: "L2",
};

test("pagePath keeps host and path, drops protocol", () => {
  assert.equal(pagePath(FDR), "freedomdebtrelief.com/glossary/d/debt-relief");
  assert.equal(pagePath(""), "(no URL)");
});

test("brandForUrl uses the page host, not a guessed section", () => {
  const fdr = brandForUrl(FDR, null, "both");
  assert.equal(fdr.slug, "fdr");
  assert.equal(fdr.label, "Freedom Debt Relief");
  const org = {
    brands: [{ slug: "lumen", name: "Lumen", url: "https://www.lumen.example/" }],
  };
  const custom = brandForUrl("https://www.lumen.example/loans", org);
  assert.equal(custom.slug, "lumen");
  assert.equal(custom.label, "Lumen");
});

test("issueSection uses citation.location and falls back to Page-level", () => {
  assert.equal(issueSection({ citations: issue.citations, pageUrl: FDR }), "canonical + H1 + JSON-LD");
  assert.equal(issueSection({ pageUrl: ACH }), PAGE_LEVEL);
  assert.equal(issueSection({ code: "H1" }), "H1");
  assert.equal(issueSection({ code: "S21" }), "JSON-LD");
  assert.equal(issueSection({}), PAGE_LEVEL);
});

test("formatIssueDetail maps page, section, what, why, fix from a BacklogItem", () => {
  const view = formatIssueDetail({ issue, crawlAt: "2026-08-23T00:01:14Z" });
  assert.ok(view);
  assert.equal(view.page.url, FDR);
  assert.equal(view.page.path, "freedomdebtrelief.com/glossary/d/debt-relief");
  assert.equal(view.page.brand, "fdr");
  assert.equal(view.page.product, "glossary");
  assert.equal(view.section, "canonical + H1 + JSON-LD");
  assert.equal(view.what, issue.title);
  assert.equal(view.why, issue.reason);
  assert.equal(view.fix, issue.fix);
  assert.equal(view.gate.verdict, "Blocks live");
  assert.equal(view.evidence.quotes.length, 1);
  assert.equal(view.evidence.quotes[0]?.quote, issue.citations[0]?.quote);
  assert.equal(view.history.length, 1);
  assert.equal(view.history[0]?.kind, "crawl");
});

test("formatIssueDetail does not invent citations and hides empty history", () => {
  const finding = {
    id: "html-1",
    code: "H1",
    title: "Page is missing a single H1",
    url: ACH,
    why: "The document title entity must own one H1.",
    found: "(no H1 in main)",
    suggested: "<main>\n  <h1>HELOC</h1>\n</main>",
  };
  const view = formatIssueDetail({ finding, history: [{ kind: "crawl", label: "   " }] });
  assert.ok(view);
  assert.equal(view.kind, "html");
  assert.equal(view.section, "H1");
  assert.equal(view.what, finding.title);
  assert.equal(view.why, finding.why);
  assert.equal(view.fix, finding.suggested);
  assert.equal(view.evidence.quotes.length, 0);
  assert.equal(view.history.length, 0);
  assert.equal(hasEvidence(view), true);
});

test("list row leads with the page and a short what-line", () => {
  const row = formatIssueListRow({
    id: issue.id,
    code: issue.code,
    title: issue.title,
    urls: issue.urls,
    citations: issue.citations,
    domain: issue.domain,
    product: issue.product,
    impact: issue.impact,
    layer: issue.layer,
  });
  assert.equal(row.pagePath, "freedomdebtrelief.com/glossary/d/debt-relief");
  assert.equal(row.brandLabel, "Freedom Debt Relief");
  assert.equal(row.section, "canonical + H1 + JSON-LD");
  assert.equal(row.what, issue.title);
  assert.equal(row.relatedPath, "achieve.com/glossary/d/debt-relief");
  assert.equal(row.relatedCount, 1);
});

test("S02-style row: issue on first URL, related is the mentioned page, fix is this page", () => {
  const relief = "https://www.freedomdebtrelief.com/debt-relief/";
  const settle = "https://www.freedomdebtrelief.com/debt-solutions/debt-settlement/";
  const s02 = {
    id: "S02",
    code: "S02",
    title: "Stop aliasing debt-relief as settlement",
    reason: "FAQ on relief names settlement.",
    fix: "Edit the FAQ on /debt-relief/ only.",
    urls: [relief, settle],
    citations: [{ url: relief, brand: "fdr", quote: "pros and cons of debt settlement", location: "FAQ" }],
    domain: "fdr",
    product: "debt-relief",
    impact: "critical",
    layer: "L2",
  };
  const view = formatIssueDetail({ issue: s02 });
  assert.ok(view);
  assert.equal(view.page.url, relief);
  assert.equal(view.fixPage.url, relief);
  assert.equal(view.relatedPages.length, 1);
  assert.equal(view.relatedPages[0]?.url, settle);
  assert.equal(view.section, "FAQ");
  const row = formatIssueListRow({
    id: s02.id,
    code: s02.code,
    title: s02.title,
    urls: s02.urls,
    citations: s02.citations,
    domain: s02.domain,
    product: s02.product,
  });
  assert.equal(row.pagePath, "freedomdebtrelief.com/debt-relief");
  assert.equal(row.relatedPath, "freedomdebtrelief.com/debt-solutions/debt-settlement");
  assert.equal(row.section, "FAQ");
});

test("formatIssueDetail returns null without issue or finding", () => {
  assert.equal(formatIssueDetail({}), null);
});

test("liveGate is a binary live/no-live verdict", () => {
  assert.equal(liveGate("critical").label, "Blocks live");
  assert.equal(liveGate("high").blocks, true);
  assert.equal(liveGate("medium").label, "Doesn't block live");
  assert.equal(liveGate("low", false).label, "Blocks live");
  assert.equal(liveGate("low", true).label, "Doesn't block live");
  assert.equal(liveGate("medium", false).label, "Blocks live");
});


test("pageUrl pins the selected row and drops other-page evidence", () => {
  const other = "https://www.achieve.com/glossary/d/accounts-receivable";
  const view = formatIssueDetail({
    issue: {
      ...issue,
      urls: [other, FDR],
      citations: [
        { url: other, brand: "achieve", quote: "other slug", location: "H1" },
        issue.citations[0],
      ],
    },
    pageUrl: FDR,
    proof: {
      conflict: "clash",
      rows: [
        { brand: "achieve", url: other, h1: "AR", canonical: other, extra: "" },
        { brand: "fdr", url: FDR, h1: "Debt Relief", canonical: FDR, extra: "" },
      ],
    },
  });
  assert.ok(view);
  assert.equal(view.page.url, FDR);
  assert.equal(view.evidence.quotes.length, 1);
  assert.equal(view.evidence.quotes[0]?.url, FDR);
  assert.equal(view.evidence.proofRows.length, 1);
  assert.equal(view.evidence.proofRows[0]?.url, FDR);
});
