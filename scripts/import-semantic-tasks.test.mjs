import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  graphNodeId,
  hubDrawn,
  transformAudit,
  assertCleanText,
  urlKey,
} from "./import-semantic-tasks.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const AUDIT =
  process.env.SEMANTIC_AUDIT ||
  "/workspace/grood-ssr-audit/deep/semantic-html-audit-deep-2026-11-24.json";
const hasAudit = fs.existsSync(AUDIT);

test("hubDrawn only allows canvas hubs", () => {
  assert.equal(hubDrawn("fdr", "glossary"), true);
  assert.equal(hubDrawn("fdr", "apply"), true);
  assert.equal(hubDrawn("fdr", "other"), false);
  assert.equal(hubDrawn("fdr", "heloc"), false);
  assert.equal(hubDrawn("achieve", "student-loans"), false);
  assert.equal(hubDrawn("achieve", "personal-loan"), true);
  assert.equal(graphNodeId("achieve", "student-loans"), "brand:achieve");
  assert.equal(graphNodeId("bills", "heloc"), "hub:bills:heloc");
});

test(
  "imported snapshot keeps every audit finding and the advertised totals",
  { skip: !hasAudit && "audit file not on this machine" },
  () => {
    const doc = JSON.parse(
      fs.readFileSync(path.join(repo, "public/data/semantic-tasks.json"), "utf8"),
    );
    const audit = JSON.parse(fs.readFileSync(AUDIT, "utf8"));
    assert.equal(doc.tasks.length, audit.tasks.length);
    assert.equal(doc.pagesAudited, audit.meta.pages_selected);
    assert.equal(doc.htmlParsed, audit.meta.pages_ok);
    assert.equal(doc.nonHtmlCount, audit.meta.pages_failed);
    assert.equal(doc.auditedAt, audit.meta.audited_at);
    const cov = audit.meta.coverage;
    assert.ok(cov.server.total >= 4000, "deep audit covers the full crawl in server HTML");
    assert.ok(cov.chromium.checked >= 600, "deep audit renders 600+ URLs in Chromium");
    for (const b of ["fdr", "achieve", "bills"])
      assert.ok(cov.chromium.by_brand[b].checked >= 200, `${b} has 200+ Chromium URLs`);
    assert.equal(
      doc.auditedAtLabel,
      `Audited in live Chromium DOM · 24 Nov 2026 · ${doc.pagesAudited.toLocaleString("en-US")} URLs checked (${cov.server.checked.toLocaleString("en-US")} full-site server + ${cov.chromium.checked.toLocaleString("en-US")} live Chromium DOM)`,
    );
    assert.equal(doc.coverage.server.checked, cov.server.checked);
    assert.equal(
      doc.coverage.chromium.byBrand.achieve.checked,
      cov.chromium.by_brand.achieve.checked,
    );
    for (const t of doc.tasks) {
      assert.ok(t.reason && t.reason.length > 40, `${t.id} has a Why it matters`);
      assert.ok((t.affectedUrlsTotal ?? 0) >= t.affectedUrls.length, t.id);
      assert.equal(t.affectedUrlsTotal, t.pageCount, t.id);
    }
    assert.deepEqual(doc.totals.byBrand, {
      fdr: audit.totals.by_brand.fdr.tasks,
      achieve: audit.totals.by_brand.achieve.tasks,
      bills: audit.totals.by_brand.bills.tasks,
    });
    assert.deepEqual(doc.totals.bySeverity, {
      critical: audit.totals.by_severity.critical ?? 0,
      high: audit.totals.by_severity.high ?? 0,
      medium: audit.totals.by_severity.medium ?? 0,
      low: audit.totals.by_severity.low ?? 0,
    });
    assert.equal(
      doc.tasks.filter((t) => t.severity === "critical").length,
      doc.totals.bySeverity.critical,
    );
    const srcIds = audit.tasks.map((t) => t.id);
    assert.deepEqual(
      doc.tasks.map((t) => t.id),
      srcIds,
    );
    for (let i = 0; i < srcIds.length; i++) {
      const s = audit.tasks[i];
      const t = doc.tasks[i];
      assert.equal(t.title, s.title);
      assert.equal(t.problem, s.problem);
      assert.equal(t.reason, s.reason);
      assert.equal(t.fix, s.fix);
      assert.equal(t.sourceOwner, s.owner);
      assert.ok(
        ["Public", "Loans", "Apply", "Enroll", "Dashboard", "Login"].includes(t.owner),
        t.id + " " + t.owner,
      );
      assert.equal(t.category, s.category);
      if (/Accessibility/i.test(s.owner)) assert.ok(t.tags.includes("Accessibility"), t.id);
      if (/SEO/i.test(s.owner)) assert.ok(t.tags.includes("SEO"), t.id);
      if (s.owner === "Web Engineering") assert.deepEqual(t.tags, []);
      assert.equal(t.affectedUrls.length, s.affected_urls.length);
      assert.equal(t.examples.length, s.examples.length);
    }
    assertCleanText(doc);
    for (const t of doc.tasks) {
      assert.ok(t.graphNodeId, t.id);
      assert.match(t.graphNodeId, /^(brand|hub):/);
      assert.ok(t.affectedUrls.every((u) => u.graphNodeId && u.url.startsWith("https://")));
    }
  },
);

test(
  "transformAudit is a pure import of the audit plus graph ids",
  { skip: !hasAudit && "audit file not on this machine" },
  () => {
    const audit = JSON.parse(fs.readFileSync(AUDIT, "utf8"));
    const crawl = JSON.parse(fs.readFileSync(path.join(repo, "public/data/crawl.json"), "utf8"));
    const doc = transformAudit(audit, crawl);
    assert.equal(doc.tasks.length, audit.tasks.length);
    assert.equal(urlKey("https://www.achieve.com/heloc/"), "achieve.com/heloc");
  },
);

import { classifyService, taskServiceOwner, disciplineTags } from "./import-semantic-tasks.mjs";

test("classifyService maps URL paths onto canonical service teams", () => {
  assert.equal(classifyService("https://apply.freedomdebtrelief.com/fb"), "Apply");
  assert.equal(classifyService("https://www.freedomdebtrelief.com/apply"), "Apply");
  assert.equal(classifyService("https://www.freedomdebtrelief.com/enroll/start"), "Enroll");
  assert.equal(classifyService("https://www.freedomdebtrelief.com/login"), "Login");
  assert.equal(classifyService("https://www.achieve.com/authors"), "Public");
  assert.equal(
    classifyService("https://www.freedomdebtrelief.com/dashboard/disclosures/"),
    "Dashboard",
  );
  assert.equal(classifyService("https://www.achieve.com/heloc"), "Loans");
  assert.equal(classifyService("https://www.bills.com/best/loans/best-personal-loans"), "Loans");
  assert.equal(classifyService("https://www.bills.com/learn/mortgages/hamp"), "Loans");
  assert.equal(classifyService("https://www.achieve.com/learn"), "Public");
  assert.equal(disciplineTags("Web Engineering + Accessibility")[0], "Accessibility");
  assert.equal(disciplineTags("Web Engineering + SEO")[0], "SEO");
  assert.deepEqual(disciplineTags("Web Engineering"), []);
  assert.equal(
    taskServiceOwner(["https://www.freedomdebtrelief.com/dashboard/disclosures/"]),
    "Dashboard",
  );
  assert.equal(
    taskServiceOwner(["https://www.bills.com/heloc", "https://www.bills.com/loans/x"]),
    "Loans",
  );
  assert.equal(
    taskServiceOwner(["https://www.achieve.com/", "https://www.achieve.com/heloc"]),
    "Public",
  );
});

test("achieve.com/learn reports 3 client-rendered h1s, not a missing h1", () => {
  const doc = JSON.parse(
    fs.readFileSync(path.join(repo, "public/data/semantic-tasks.json"), "utf8"),
  );
  const learn = "https://www.achieve.com/learn";
  const onLearn = (t) => t.affectedUrls.find((u) => u.url.replace(/\/$/, "") === learn);
  assert.equal(
    doc.tasks.some((t) => t.rule === "missing-h1" && onLearn(t)),
    false,
  );
  const multiple = doc.tasks.find((t) => t.id === "achieve-multiple-h1");
  assert.ok(multiple, "expected achieve-multiple-h1");
  assert.ok(onLearn(multiple));
  for (const h of ["Financial Education", "Money & Lifestyle", "Insights & News"])
    assert.match(multiple.problem, new RegExp(h));
  assert.match(multiple.problem, /rendered client-side/);
  const ex = multiple.examples.find((e) => e.url.replace(/\/$/, "") === learn);
  assert.ok(ex, "learn should be a representative example");
  assert.deepEqual(ex.h1Texts, ["Financial Education", "Money & Lifestyle", "Insights & News"]);
  assert.equal(onLearn(multiple).ssrDiff, "Server HTML: 0 <h1> → Client DOM: 3 <h1>");
  assert.equal(onLearn(multiple).renderSource, "client-only");
  const ssr = doc.tasks.find((t) => t.id === "achieve-ssr-missing-h1");
  assert.ok(ssr, "expected the SSR gap task");
  assert.equal(onLearn(ssr).ssrDiff, "Server HTML: 0 <h1> → Client DOM: 3 <h1>");
  assert.deepEqual(ssr.renderDiff, { url: learn, server: "0 <h1>", client: "3 <h1>" });
});

test("every task carries a render source and a server-vs-client summary", () => {
  const doc = JSON.parse(
    fs.readFileSync(path.join(repo, "public/data/semantic-tasks.json"), "utf8"),
  );
  const sources = new Set(["server+client", "client-only", "diff"]);
  for (const t of doc.tasks) {
    assert.ok(sources.has(t.renderSource), t.id);
    assert.ok(t.ssrDiff, t.id);
    if (t.renderSource !== "server+client")
      assert.ok(t.renderDiff?.server && t.renderDiff?.client, t.id);
  }
  const by = doc.totals.byRenderSource;
  assert.equal(by["server+client"] + by["client-only"] + by.diff, doc.tasks.length);
});

import { auditedLabel, coverageOf } from "./import-semantic-tasks.mjs";

test("auditedLabel and coverageOf report both audit tiers", () => {
  const meta = {
    audited_at: "2026-11-24T05:09:00+04:00",
    pages_selected: 4464,
    coverage: {
      server: {
        checked: 4390,
        total: 4464,
        by_brand: {
          fdr: { checked: 1120, total: 1188 },
          achieve: { checked: 1131, total: 1131 },
          bills: { checked: 2139, total: 2145 },
        },
      },
      chromium: {
        checked: 923,
        total: 936,
        by_brand: {
          fdr: { checked: 287, total: 300 },
          achieve: { checked: 301, total: 301 },
          bills: { checked: 335, total: 335 },
        },
      },
    },
  };
  assert.equal(
    auditedLabel(meta),
    "Audited in live Chromium DOM · 24 Nov 2026 · 4,464 URLs checked (4,390 full-site server + 923 live Chromium DOM)",
  );
  const c = coverageOf(meta);
  assert.deepEqual(c.server.byBrand.bills, { checked: 2139, total: 2145 });
  assert.equal(c.chromium.checked, 923);
  assert.equal(coverageOf({}), null);
  assert.equal(
    auditedLabel({ audited_at: "2026-11-24T03:00:00+04:00", pages_selected: 156 }),
    "Audited in live Chromium DOM · 24 Nov 2026 · 156 URLs checked",
  );
});

test("footer/nav heading task is not labelled header-only", () => {
  const doc = JSON.parse(
    fs.readFileSync(path.join(repo, "public/data/semantic-tasks.json"), "utf8"),
  );
  for (const t of doc.tasks.filter((x) => x.rule === "heading-in-header-nav"))
    assert.match(t.title, /<header>\/<nav>\/<footer>/);
});
