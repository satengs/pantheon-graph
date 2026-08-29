import assert from "node:assert/strict";
import test from "node:test";
import { analyzeAeo, extractAeo } from "./aeo.ts";

test("noindex and nosnippet and missing canonical become findings", () => {
  const html = `<html><head>
    <meta name="robots" content="noindex, nosnippet, max-snippet:0">
    <meta name="description" content="">
  </head><body><p data-nosnippet>secret</p></body></html>`;
  const f = analyzeAeo(html, "https://www.freedomdebtrelief.com/hidden");
  const codes = f.map((x) => x.code).sort();
  assert.deepEqual(codes, ["CANON", "HREF", "MDESC", "NOSNIPPET", "ROBOTS"]);
});

test("one canonical and links is clean of AEO gates", () => {
  const html = `<html><head>
    <link rel="canonical" href="https://www.freedomdebtrelief.com/debt-relief/">
    <meta name="description" content="Unique FDR description.">
  </head><body><a href="/glossary/d/debt-relief/">Debt relief</a></body></html>`;
  const a = extractAeo(html, "https://www.freedomdebtrelief.com/debt-relief/");
  assert.equal(a.canonicals.length, 1);
  assert.equal(a.noindex, false);
  assert.ok(a.hrefCount >= 1);
  assert.equal(analyzeAeo(html, "https://www.freedomdebtrelief.com/debt-relief/").length, 0);
});
