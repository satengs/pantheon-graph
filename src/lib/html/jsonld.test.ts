import assert from "node:assert/strict";
import test from "node:test";
import { analyzeJsonLd, extractJsonLd } from "./jsonld.ts";

const FDR = "https://www.freedomdebtrelief.com/debt-relief/";
const HEL = "https://www.achieve.com/heloc";

test("flags missing JSON-LD", () => {
  const f = analyzeJsonLd("<html><body><h1>HELOC</h1></body></html>", HEL);
  assert.equal(f.some((x) => x.code === "S21" && /missing/i.test(x.title)), true);
});

test("flags Organization @id mismatch", () => {
  const html = `<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": "https://www.achieve.com/about#org",
    name: "Achieve",
  })}</script>`;
  const f = analyzeJsonLd(html, "https://www.achieve.com/", { brand: "achieve", product: "other" });
  assert.equal(f.some((x) => x.code === "S05"), true);
});

test("flags competing types and expected Service on FDR relief", () => {
  const html = `<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", "@id": "https://www.freedomdebtrelief.com/#organization" },
      { "@type": ["WebPage", "FAQPage", "Article"], "@id": FDR, name: "Debt relief" },
    ],
  })}</script>`;
  const nodes = extractJsonLd(html).nodes;
  assert.ok(nodes.some((n) => n.types.includes("FAQPage")));
  const f = analyzeJsonLd(html, FDR, { brand: "fdr", product: "debt-relief" });
  assert.equal(f.some((x) => x.code === "S07"), true);
  assert.equal(f.some((x) => x.code === "S21" && /does not match/i.test(x.title)), true);
});

test("passes a matching Service + org pin", () => {
  const html = `<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", "@id": "https://www.freedomdebtrelief.com/#organization" },
      { "@type": "Service", "@id": FDR, name: "Debt relief" },
    ],
  })}</script>`;
  const f = analyzeJsonLd(html, FDR, { brand: "fdr", product: "debt-relief" });
  assert.equal(f.length, 0);
});
