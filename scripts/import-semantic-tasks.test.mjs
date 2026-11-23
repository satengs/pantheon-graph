import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { graphNodeId, hubDrawn, transformAudit, assertCleanText, urlKey } from "./import-semantic-tasks.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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

test("imported snapshot keeps every audit finding and the advertised totals", () => {
  const doc = JSON.parse(fs.readFileSync(path.join(repo, "public/data/semantic-tasks.json"), "utf8"));
  const audit = JSON.parse(fs.readFileSync("/workspace/semantic-html-audit-2026-11-24.json", "utf8"));
  assert.equal(doc.tasks.length, audit.tasks.length);
  assert.equal(doc.pagesAudited, 156);
  assert.equal(doc.htmlParsed, 151);
  assert.equal(doc.nonHtmlCount, 5);
  assert.equal(doc.auditedAt, audit.meta.audited_at);
  assert.match(doc.auditedAtLabel, /^Audited in live Chromium DOM · 156 URLs checked$/);
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
  assert.equal(doc.tasks.filter((t) => t.severity === "critical").length, doc.totals.bySeverity.critical);
  const srcIds = audit.tasks.map((t) => t.id);
  assert.deepEqual(doc.tasks.map((t) => t.id), srcIds);
  for (let i = 0; i < srcIds.length; i++) {
    const s = audit.tasks[i];
    const t = doc.tasks[i];
    assert.equal(t.title, s.title);
    assert.equal(t.problem, s.problem);
    assert.equal(t.reason, s.reason);
    assert.equal(t.fix, s.fix);
    assert.equal(t.sourceOwner, s.owner);
    assert.ok(["Public", "Loans", "Apply", "Enroll", "Dashboard", "Login"].includes(t.owner), t.id + " " + t.owner);
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
});

test("transformAudit is a pure import of the audit plus graph ids", () => {
  const audit = JSON.parse(fs.readFileSync("/workspace/semantic-html-audit-2026-11-24.json", "utf8"));
  const crawl = JSON.parse(fs.readFileSync(path.join(repo, "public/data/crawl.json"), "utf8"));
  const doc = transformAudit(audit, crawl);
  assert.equal(doc.tasks.length, audit.tasks.length);
  assert.equal(urlKey("https://www.achieve.com/heloc/"), "achieve.com/heloc");
});

import { classifyService, taskServiceOwner, disciplineTags } from "./import-semantic-tasks.mjs";

test("classifyService maps URL paths onto canonical service teams", () => {
  assert.equal(classifyService("https://apply.freedomdebtrelief.com/fb"), "Apply");
  assert.equal(classifyService("https://www.freedomdebtrelief.com/apply"), "Apply");
  assert.equal(classifyService("https://www.freedomdebtrelief.com/enroll/start"), "Enroll");
  assert.equal(classifyService("https://www.freedomdebtrelief.com/login"), "Login");
  assert.equal(classifyService("https://www.achieve.com/authors"), "Public");
  assert.equal(classifyService("https://www.freedomdebtrelief.com/dashboard/disclosures/"), "Dashboard");
  assert.equal(classifyService("https://www.achieve.com/heloc"), "Loans");
  assert.equal(classifyService("https://www.bills.com/best/loans/best-personal-loans"), "Loans");
  assert.equal(classifyService("https://www.bills.com/learn/mortgages/hamp"), "Loans");
  assert.equal(classifyService("https://www.achieve.com/learn"), "Public");
  assert.equal(disciplineTags("Web Engineering + Accessibility")[0], "Accessibility");
  assert.equal(disciplineTags("Web Engineering + SEO")[0], "SEO");
  assert.deepEqual(disciplineTags("Web Engineering"), []);
  assert.equal(taskServiceOwner(["https://www.freedomdebtrelief.com/dashboard/disclosures/"]), "Dashboard");
  assert.equal(taskServiceOwner(["https://www.bills.com/heloc", "https://www.bills.com/loans/x"]), "Loans");
  assert.equal(taskServiceOwner(["https://www.achieve.com/", "https://www.achieve.com/heloc"]), "Public");
});

test("achieve.com/learn reports 3 visible rendered h1s, not a missing h1", () => {
  const doc = JSON.parse(fs.readFileSync(path.join(repo, "public/data/semantic-tasks.json"), "utf8"));
  assert.equal(doc.tasks.some((t) => t.id === "achieve-missing-h1"), false);
  const multiple = doc.tasks.find((t) => t.id === "achieve-multiple-h1");
  assert.ok(multiple, "expected achieve-multiple-h1");
  const learn = "https://www.achieve.com/learn";
  assert.ok(multiple.affectedUrls.some((u) => u.url.replace(/\/$/, "") === learn));
  assert.match(multiple.problem, /Financial Education/);
  assert.match(multiple.problem, /Money & Lifestyle/);
  assert.match(multiple.problem, /Insights & News/);
  assert.match(multiple.problem, /injected client-side/);
  const ex = multiple.examples.find((e) => e.url.replace(/\/$/, "") === learn);
  assert.ok(ex, "learn should be a representative example");
  assert.deepEqual(ex.h1Texts ?? ex.h1_texts, ["Financial Education", "Money & Lifestyle", "Insights & News"]);
  const ssr = doc.tasks.find((t) => t.id === "achieve-ssr-injected-h1");
  assert.ok(ssr);
  assert.ok(ssr.affectedUrls.some((u) => u.url.replace(/\/$/, "") === learn));
});
