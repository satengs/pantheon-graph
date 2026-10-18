import assert from "node:assert/strict";
import test from "node:test";
import { evidenceLabel, normSeverity } from "./evidence-label.ts";

const rows = (...s: unknown[]) => s.map((severity) => ({ severity }));

test("counts rated criticals; the rest is never 'unknown' or 'undefined'", () => {
  const l = evidenceLabel(rows("critical", "unrated", "unrated", "critical"))!;
  assert.equal(l.full, "Evidence 4 · 2 critical");
  assert.deepEqual(l.compact, ["4", "2 crit"]);
  assert.equal(l.unrated, 2);
});

test("none rated → 'unrated'", () => {
  const l = evidenceLabel(rows("unrated", "unrated", "unrated", "unrated", "unrated"))!;
  assert.equal(l.full, "Evidence 5 · unrated");
  assert.deepEqual(l.compact, ["5"]);
  assert.equal(l.worst, null);
});

test("legacy 'unknown', missing, null and junk severities count as unrated", () => {
  const legacy = [...rows("critical", "unknown", "unknown", null, undefined, "Unknown", 7), {}];
  const l = evidenceLabel(legacy)!;
  assert.equal(l.full, "Evidence 8 · 1 critical");
  assert.equal(l.unrated, 7);
  const onlyLegacy = evidenceLabel([...rows("unknown", "unknown", "unknown", "unknown", "unknown")])!;
  assert.equal(onlyLegacy.full, "Evidence 5 · unrated");
  assert.deepEqual(onlyLegacy.compact, ["5"]);
  for (const l2 of [l, onlyLegacy]) {
    const all = [l2.full, ...l2.compact].join(" ");
    assert.doesNotMatch(all, /unknown|undefined|null|NaN/i);
  }
});

test("worst rated level wins (high when no critical); empty → null", () => {
  assert.equal(evidenceLabel(rows("low", "high", "high", "unrated"))!.full, "Evidence 4 · 2 high");
  assert.deepEqual(evidenceLabel(rows("medium"))!.compact, ["1", "1 med"]);
  assert.equal(evidenceLabel([]), null);
  assert.equal(evidenceLabel(null), null);
  assert.equal(normSeverity("unknown"), "unrated");
  assert.equal(normSeverity(undefined), "unrated");
});
