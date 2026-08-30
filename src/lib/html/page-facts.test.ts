import assert from "node:assert/strict";
import test from "node:test";
import { extractPageFacts } from "./page-facts.ts";

test("extractPageFacts reads title H1 canonical and NMLS", () => {
  const html = `<html><head><title>Loans | Brand</title>
  <link rel="canonical" href="https://ex.com/loans">
  <meta property="og:title" content="Loans | Brand">
  <script type="application/ld+json">{"@type":"LoanOrCredit"}</script>
  </head><body><h1>Get a loan</h1><p>NMLS ID 1248929</p></body></html>`;
  const f = extractPageFacts(html, "https://ex.com/loans");
  assert.equal(f.title, "Loans | Brand");
  assert.equal(f.h1, "Get a loan");
  assert.equal(f.canonical, "https://ex.com/loans");
  assert.ok(f.jsonLdTypes.includes("LoanOrCredit"));
  assert.equal(f.hasNmls, true);
  assert.deepEqual(f.nmlsIds, ["1248929"]);
});
