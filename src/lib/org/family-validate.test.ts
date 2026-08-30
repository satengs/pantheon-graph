import assert from "node:assert/strict";
import test from "node:test";
import { brandSlugForUrl, familyIsSeed, findingFitsFamilyRules, recheckTargets } from "./family-validate.ts";
import { SYSTEM_RULE_CODES } from "./system-rules.ts";

const pantheonBrands = [
  { slug: "fdr", website: "https://www.freedomdebtrelief.com/", parentId: "p1" },
  { slug: "achieve", website: "https://www.achieve.com/", parentId: "p1" },
];
const northstarBrands = [
  { slug: "lumen", website: "https://www.lumen.example/", parentId: "p2" },
  { slug: "harbor", website: "https://harbor.example/", parentId: "p2" },
];

test("familyIsSeed detects Pantheon / FDR / Achieve", () => {
  assert.equal(familyIsSeed("pantheon", ["lumen"]), true);
  assert.equal(familyIsSeed("northstar", ["fdr", "harbor"]), true);
  assert.equal(familyIsSeed("northstar", ["lumen", "harbor"]), false);
});

test("recheckTargets for a new family uses only that family's sites", () => {
  const urls = recheckTargets({
    parentId: "p2",
    parentSlug: "northstar",
    parentWebsite: "",
    brands: [...pantheonBrands, ...northstarBrands],
    seedUrls: ["https://www.freedomdebtrelief.com/debt-relief/"],
  });
  assert.deepEqual(urls, ["https://www.lumen.example/", "https://harbor.example/"]);
});

test("recheckTargets for the seed family keeps seed URLs", () => {
  const urls = recheckTargets({
    parentId: "p1",
    parentSlug: "pantheon",
    brands: pantheonBrands,
    seedUrls: ["https://www.freedomdebtrelief.com/debt-relief/"],
  });
  assert.ok(urls.includes("https://www.freedomdebtrelief.com/"));
  assert.ok(urls.includes("https://www.achieve.com/"));
  assert.ok(urls.includes("https://www.freedomdebtrelief.com/debt-relief/"));
});

test("brandSlugForUrl matches host", () => {
  assert.equal(brandSlugForUrl("https://www.lumen.example/about", northstarBrands), "lumen");
  assert.equal(brandSlugForUrl("https://other.example/", northstarBrands), undefined);
});

test("findingFitsFamilyRules keeps system and attached codes", () => {
  const attached = [...SYSTEM_RULE_CODES];
  assert.equal(findingFitsFamilyRules("S21", attached), true);
  assert.equal(findingFitsFamilyRules("S02", attached), false);
  assert.equal(findingFitsFamilyRules("S01", []), true);
});
