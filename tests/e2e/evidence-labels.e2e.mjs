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

  // Data change pending sign-off: Evidence Brief 2026-11-20 + Funnel Fix Nov 19 sweep.
  // Was 'Evidence 165 · 10 critical' on 32c692f (#42), then 'Evidence 167 · 14 critical'
  // before E133 was returned to Funnel Fix High (brief P0 kept as a note).
  test("snapshot: parent reads 'Evidence 167 · 13 critical'", async () => {
    const t = await page.evaluate(() => document.querySelector('g[data-node-id^="parent:"] [data-ev-label]')?.getAttribute("data-ev-label"));
    assert.equal(t, "Evidence 167 · 13 critical");
  });

  test("collapsed Apply hub shows a critical evidence marker and an off-crawl findings label", async () => {
    const r = await page.evaluate(() => {
      const g = document.querySelector('g[data-node-id="hub:fdr:apply"]');
      const marker = g?.querySelector("[data-ev-sev-marker]");
      return {
        evMarker: marker?.getAttribute("data-ev-sev-marker"),
        label: marker?.getAttribute("data-ev-sev-label") ?? marker?.textContent?.trim(),
        shown: g?.querySelector('[data-testid="hub-shown"]')?.textContent,
        sev: g?.getAttribute("data-sev"),
        legend: document.querySelector('[data-testid="legend-ev-critical-ring"]')?.textContent?.replace(/\s+/g, " ").trim(),
      };
    });
    assert.equal(r.sev, null, "Apply has no Pantheon issue; data-sev stays unset");
    assert.equal(r.evMarker, "critical");
    // Caption is evidenceLabel().full — not a bare Pantheon-style "C1" pill.
    assert.equal(r.label, "Evidence 10 · 1 critical");
    assert.equal(r.shown, "Off-crawl · 10 findings");
    assert.match(r.legend ?? "", /Outlined red = critical evidence finding, not counted in Pantheon C\/H\/M\/L/);
  });

  test("legend shows separate to-verify and unverified chips", async () => {
    const r = await page.evaluate(() => ({
      toVerify: document.querySelector('[data-testid="legend-to-verify-chip"]')?.textContent?.trim(),
      unverified: document.querySelector('[data-testid="legend-unverified-chip"]')?.textContent?.trim(),
    }));
    assert.equal(r.toVerify, "? to verify");
    assert.equal(r.unverified, "unverified");
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
