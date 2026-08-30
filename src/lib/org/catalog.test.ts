import assert from "node:assert/strict";
import test from "node:test";
import { isSystemRule, SYSTEM_RULE_CODES } from "./system-rules.ts";
import { familyIsSeed, findingFitsFamilyRules } from "./family-validate.ts";

test("system rules are schema / canonical / JSON-LD / article semantics", () => {
  assert.ok(SYSTEM_RULE_CODES.includes("S21"));
  assert.ok(SYSTEM_RULE_CODES.includes("S01"));
  assert.ok(SYSTEM_RULE_CODES.includes("S28"));
  assert.equal(isSystemRule("S21"), true);
  assert.equal(isSystemRule("S01"), true);
  assert.equal(isSystemRule("S02"), false);
  assert.equal(isSystemRule("S99", "system"), true);
});

test("new families are not the FDR x Achieve seed", () => {
  assert.equal(familyIsSeed("pantheon", ["lumen"]), true);
  assert.equal(familyIsSeed("northstar", ["lumen", "harbor"]), false);
  assert.equal(findingFitsFamilyRules("S21", [...SYSTEM_RULE_CODES]), true);
  assert.equal(findingFitsFamilyRules("S02", [...SYSTEM_RULE_CODES]), false);
});
