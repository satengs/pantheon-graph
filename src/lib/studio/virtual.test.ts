import assert from "node:assert/strict";
import test from "node:test";
import { windowRange } from "./virtual.ts";

test("windowRange overscans and clamps", () => {
  assert.deepEqual(windowRange(0, 0, 400, 48), { start: 0, end: 0 });
  assert.deepEqual(windowRange(3, 0, 400, 48, 8), { start: 0, end: 3 });
  const mid = windowRange(200, 48 * 50, 240, 48, 2);
  assert.equal(mid.start, 48);
  assert.equal(mid.end, 50 + Math.ceil(240 / 48) + 2);
});
