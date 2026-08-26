import assert from "node:assert/strict";
import { detectRuleConflicts } from "./rule-conflicts.ts";

const none = detectRuleConflicts([
  {
    code: "S32",
    title: "Silo HELOC and home equity loan",
    domain: "achieve",
    product: "heloc",
    statement: "They are different products and must stay siloed. Two URLs.",
  },
  {
    code: "S22",
    title: "FDR owns /debt-relief",
    domain: "fdr",
    product: "debt-relief",
    statement: "FDR owns debt relief. Achieve must not clone the product URL.",
  },
]);
assert.equal(none.length, 0, "seed-like pair should not conflict");

const siloMerge = detectRuleConflicts([
  {
    code: "S32",
    title: "Silo HELOC and HEL",
    domain: "achieve",
    product: "heloc",
    statement: "HELOC and home equity loan must stay siloed as different products.",
  },
  {
    code: "X01",
    title: "Merge HELOC into HEL",
    domain: "achieve",
    product: "hel",
    statement: "Treat HELOC and home equity loan as the same product. Merge to one URL.",
  },
]);
assert.equal(siloMerge.some((c) => c.kind === "silo-vs-merge"), true);

const shelf = detectRuleConflicts([
  {
    code: "X02",
    title: "FDR HELOC page",
    domain: "fdr",
    product: "heloc",
    statement: "Publish HELOC on FDR.",
  },
]);
assert.equal(shelf.some((c) => c.kind === "wrong-shelf"), true);

const dup = detectRuleConflicts([
  { code: "S01", title: "A", domain: "both", product: "all", statement: "one" },
  { code: "S01", title: "B", domain: "both", product: "all", statement: "two" },
]);
assert.equal(dup.some((c) => c.kind === "duplicate-code"), true);

console.log("rule-conflicts.test.ts ok");
