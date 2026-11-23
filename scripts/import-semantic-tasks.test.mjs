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

test("imported snapshot keeps all 31 findings and the advertised totals", () => {
  const doc = JSON.parse(fs.readFileSync(path.join(repo, "public/data/semantic-tasks.json"), "utf8"));
  const audit = JSON.parse(fs.readFileSync("/workspace/semantic-html-audit-2026-11-24.json", "utf8"));
  assert.equal(doc.tasks.length, 31);
  assert.equal(doc.pagesAudited, 156);
  assert.equal(doc.htmlParsed, 151);
  assert.equal(doc.nonHtmlCount, 5);
  assert.equal(doc.auditedAt, "2026-11-24T03:13:55+04:00");
  assert.deepEqual(doc.totals.byBrand, { fdr: 12, achieve: 13, bills: 6 });
  assert.deepEqual(doc.totals.bySeverity, { critical: 4, high: 8, medium: 19, low: 0 });
  assert.equal(doc.tasks.filter((t) => t.severity === "critical").length, 4);
  const srcIds = audit.tasks.map((t) => t.id);
  assert.deepEqual(doc.tasks.map((t) => t.id), srcIds);
  for (let i = 0; i < srcIds.length; i++) {
    const s = audit.tasks[i];
    const t = doc.tasks[i];
    assert.equal(t.title, s.title);
    assert.equal(t.problem, s.problem);
    assert.equal(t.reason, s.reason);
    assert.equal(t.fix, s.fix);
    assert.equal(t.owner, s.owner);
    assert.equal(t.category, s.category);
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
  assert.equal(doc.tasks.length, 31);
  assert.equal(urlKey("https://www.achieve.com/heloc/"), "achieve.com/heloc");
});
