// guard: click map — left selects, right inspects, only a real double-click toggles, hub drag
// moves the group, empty-canvas drag pans.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { center, closeAll, coldGraph, hubShown, pagesOfHub, parseT, sleep, transformOf } from "./_app.mjs";

const inspectorText = (page) =>
  page.evaluate(() => [...document.querySelectorAll("aside")].map((a) => a.innerText).find((t) => /Identity/i.test(t)) ?? null);
/** Camera = SVG viewBox (zoom/fit) + the pan translate on the canvas's top-level <g>. */
const viewBox = (page) =>
  page.evaluate(() => {
    const svg = document.querySelector('svg[role="img"][viewBox]');
    return `${svg?.getAttribute("viewBox")} | ${svg?.querySelector(":scope > g")?.getAttribute("transform")}`;
  });

describe("guard: click map", () => {
  let ctx;
  let page;
  before(async () => {
    ({ context: ctx, page } = await coldGraph());
  });
  after(async () => {
    await ctx?.close();
    await closeAll();
  });

  test("left-click on a page only selects it", async () => {
    const id = await page.evaluate(() => document.querySelector('g[data-kind="page"]')?.dataset.nodeId);
    const url0 = page.url();
    const p = await center(page, id);
    await page.mouse.click(p.x, p.y);
    await sleep(600);
    const sel = await page.evaluate(() => [...document.querySelectorAll('[data-selected="true"]')].map((g) => g.dataset.nodeId));
    assert.deepEqual(sel, [id]);
    assert.equal(await inspectorText(page), null, "left-click must not open the inspector");
    assert.equal(page.url(), url0);
  });

  test("right-click on a page opens the inspector with URL + live gate", async () => {
    const { id, url } = await page.evaluate(() => {
      const g = document.querySelector('g[data-kind="page"]');
      return { id: g.dataset.nodeId, url: g.dataset.url };
    });
    const p = await center(page, id);
    await page.mouse.click(p.x, p.y, { button: "right" });
    await sleep(1000);
    const t = await inspectorText(page);
    assert.ok(t, "inspector should open");
    assert.match(t, /\bPAGE\b/);
    assert.ok(t.includes(url), `inspector shows ${url}`);
    assert.match(t, /blocks live|doesn.t block live/i);
  });

  test("right-click on a product opens identity + children", async () => {
    const p = await center(page, "hub:achieve:heloc");
    await page.mouse.click(p.x, p.y, { button: "right" });
    await sleep(1000);
    const t = await inspectorText(page);
    assert.ok(t, "inspector should open");
    assert.match(t, /\bPRODUCT\b/);
    assert.match(t, /HELOC/);
    assert.match(t, /\d+ pages/);
    assert.match(t, /Children/i);
  });

  test("a real double-click expands and collapses a product", async () => {
    assert.equal(await pagesOfHub(page, "bills", "consolidation"), 0);
    let p = await center(page, "hub:bills:consolidation");
    await page.mouse.dblclick(p.x, p.y);
    await sleep(1000);
    assert.ok((await pagesOfHub(page, "bills", "consolidation")) > 0, "double-click should expand");
    assert.match((await hubShown(page, "hub:bills:consolidation")) ?? "", /^\d+ of \d+ shown$/);
    p = await center(page, "hub:bills:consolidation");
    await page.mouse.dblclick(p.x, p.y);
    await sleep(1000);
    assert.equal(await pagesOfHub(page, "bills", "consolidation"), 0, "second double-click should collapse");
  });

  test("two slow single clicks do not toggle (even if the browser emits dblclick)", async () => {
    const before = await page.evaluate(() => document.querySelectorAll('g[data-kind="page"]').length);
    let p = await center(page, "brand:achieve");
    await page.mouse.click(p.x, p.y);
    await sleep(650);
    p = await center(page, "brand:achieve");
    await page.mouse.click(p.x, p.y);
    await sleep(900);
    assert.equal(await page.evaluate(() => document.querySelectorAll('g[data-kind="page"]').length), before);
    // Slow pair that still yields a native dblclick (2nd press reports clickCount 2).
    p = await center(page, "hub:achieve:heloc");
    await page.mouse.click(p.x, p.y);
    await sleep(650);
    await page.mouse.move(p.x, p.y);
    await page.mouse.down({ clickCount: 2 });
    await page.mouse.up({ clickCount: 2 });
    await sleep(900);
    assert.equal(await page.evaluate(() => document.querySelectorAll('g[data-kind="page"]').length), before);
    assert.ok((await pagesOfHub(page, "achieve", "heloc")) > 0, "HELOC stays expanded");
  });

  test("dragging a hub moves the hub with its pages, not the camera", async () => {
    const hub = "hub:achieve:heloc";
    const pageId = await page.evaluate(() => document.querySelector('g[data-node-id^="page:achieve:heloc:"]')?.dataset.nodeId);
    assert.ok(pageId, "HELOC has pages drawn");
    const vb0 = await viewBox(page);
    const h0 = parseT(await transformOf(page, hub));
    const p0 = parseT(await transformOf(page, pageId));
    const c = await center(page, hub);
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) await page.mouse.move(c.x + i * 8, c.y + i * 6);
    await page.mouse.up();
    await sleep(600);
    const h1 = parseT(await transformOf(page, hub));
    const p1 = parseT(await transformOf(page, pageId));
    const dh = { x: h1.x - h0.x, y: h1.y - h0.y };
    const dp = { x: p1.x - p0.x, y: p1.y - p0.y };
    assert.ok(Math.hypot(dh.x, dh.y) > 20, "hub moved");
    assert.ok(Math.abs(dh.x - dp.x) < 0.5 && Math.abs(dh.y - dp.y) < 0.5, "page moved with its hub");
    assert.equal(await viewBox(page), vb0, "hub drag must not pan");
    await page.click('[data-testid="reset-layout"]');
    await sleep(800);
  });

  test("dragging empty canvas pans and leaves nodes in place", async () => {
    const pt = await page.evaluate(() => {
      const svg = document.querySelector('svg[role="img"][viewBox]');
      const r = svg.getBoundingClientRect();
      for (let y = r.top + 40; y < r.bottom - 80; y += 20)
        for (let x = r.left + 30; x < r.right - 30; x += 20) {
          const el = document.elementFromPoint(x, y);
          if (el === svg || (el?.tagName === "rect" && !el.closest("g[data-node-id]") && el.closest("svg") === svg && !el.closest("[data-ev-marker]")))
            return { x, y };
        }
      return null;
    });
    assert.ok(pt, "found empty canvas");
    const vb0 = await viewBox(page);
    const t0 = await transformOf(page, "brand:achieve");
    await page.mouse.move(pt.x, pt.y);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) await page.mouse.move(pt.x + i * 10, pt.y + i * 5);
    await page.mouse.up();
    await sleep(500);
    assert.notEqual(await viewBox(page), vb0, "empty-canvas drag pans the camera");
    assert.equal(await transformOf(page, "brand:achieve"), t0, "nodes stay put");
  });
});
