import assert from "node:assert/strict";
import test from "node:test";
import { isMagenta, scanText } from "./guard-ui-style.mjs";

test("flags pink / fuchsia / rose classes", () => {
  assert.equal(scanText('<p className="text-pink-500 hover:bg-rose-100/50">').length, 2);
  assert.equal(scanText('<p className="bg-fuchsia-600">').length, 1);
  assert.equal(scanText('<p className="text-red-500 bg-orange-200">').length, 0);
});

test("magenta-range hex values fail, red / orange / greys pass", () => {
  for (const c of ["#ff00ff", "#e91e63", "#d63384", "#c026d3", "#f0f"]) assert.equal(isMagenta(c), true, c);
  for (const c of ["#e5392f", "#ff8c1a", "#b8e04a", "#dcdcdc", "#9aa3ad", "#0b0c0e", "#7c3aed"]) assert.equal(isMagenta(c), false, c);
});

test("rounded card + border-l stripe fails; plain rounded card passes", () => {
  assert.equal(scanText('<div className="rounded-lg border-l-4 border-l-red-500 p-2">').length, 1);
  assert.equal(scanText('<div className="rounded-md border-l-2 bg-surface">').length, 1);
  assert.equal(scanText('<div className="rounded-lg border border-border p-2">').length, 0);
  assert.equal(scanText('<div className="border-l border-border pl-2">').length, 0);
  assert.equal(scanText('<div className="rounded border-l-0">').length, 0);
});
