// guard: evidence labels — canvas tags and legend agree (both from evidenceLabel()), and no view
// ever shows "undefined" / "unknown".
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { badStrings, center, closeAll, coldGraph, sleep, tab } from "./_app.mjs";

const LABEL = /^Evidence \d+ · (\d+ (critical|high|medium|low)|unrated)$/;

describe("guard: evidence labels", () => {
  let ctx;
  let page;
  before(async () => {
    ({ context: ctx, page } = await coldGraph());
    await page.click('[data-source-chip="both"]');
    await page.waitForSelector('[data-testid="legend-evidence"]', { timeout: 20_000 });
    await sleep(500);
  });
  after(async () => {
    await ctx?.close();
    await closeAll();
  });

  test("parent tag and legend show the same evidenceLabel() text", async () => {
    const r = await page.evaluate(() => ({
      parent: document.querySelector('g[data-node-id^="parent:"] [data-ev-label]')?.getAttribute("data-ev-label"),
      parentText: document.querySelector('g[data-node-id^="parent:"] [data-ev-marker]')?.textContent,
      legend: [...document.querySelectorAll('[data-testid="legend-evidence"] [data-ev-tag]')].map((t) => t.textContent),
      tags: [...document.querySelectorAll("[data-ev-label]")].map((g) => g.getAttribute("data-ev-label")),
    }));
    assert.match(r.parent ?? "", LABEL);
    assert.equal(r.parentText, r.parent, "parent tag renders its label");
    assert.equal(r.legend[0], r.parent, "legend example = parent tag");
    for (const t of r.tags) assert.match(t, LABEL);
  });

  test("snapshot: parent reads 'Evidence 84 · 4 critical'", async () => {
    const t = await page.evaluate(() => document.querySelector('g[data-node-id^="parent:"] [data-ev-label]')?.getAttribute("data-ev-label"));
    assert.equal(t, "Evidence 84 · 4 critical");
  });

  test("no 'undefined' / 'unknown' on Graph", async () => {
    assert.deepEqual(await badStrings(page), []);
  });

  test("no 'undefined' / 'unknown' in the HELOC inspector", async () => {
    const p = await center(page, "hub:achieve:heloc");
    await page.mouse.click(p.x, p.y, { button: "right" });
    await page.waitForSelector('[data-testid="inspector-evidence"]', { timeout: 15_000 });
    await sleep(500);
    assert.deepEqual(await badStrings(page), []);
    await page.keyboard.press("Escape");
  });

  test("no 'undefined' / 'unknown' on Issues and Gate", async () => {
    await tab(page, "Issues");
    await page.waitForSelector('[data-testid="issues-sev-totals"]');
    assert.deepEqual(await badStrings(page), []);
    await tab(page, "Gate");
    await page.waitForSelector('[data-testid="gate-sev-totals"]');
    assert.deepEqual(await badStrings(page), []);
  });
});
