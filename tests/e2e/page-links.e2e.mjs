// guard: page links S01/S06 only — on the live canvas.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { closeAll, coldGraph } from "./_app.mjs";

describe("guard: page links S01/S06 only", () => {
  let ctx;
  let page;
  before(async () => {
    ({ context: ctx, page } = await coldGraph());
  });
  after(async () => {
    await ctx?.close();
    await closeAll();
  });

  test("the only issue nodes drawn are S01 and S06", async () => {
    // Issue nodes carry no id attribute; their label is the rule code.
    const issues = await page.evaluate(() =>
      [...document.querySelectorAll('g[data-kind="issue"]')].map(
        (g) => [...g.querySelectorAll("text")].map((t) => t.textContent.trim()).find((x) => /^[A-Z]+\d+$/.test(x)) ?? g.textContent.trim(),
      ),
    );
    assert.deepEqual([...issues].sort(), ["S01", "S06"]);
  });

  test("cross-brand L2 is one brand-to-brand arc per pair", async () => {
    const arcs = await page.evaluate(() =>
      [...document.querySelectorAll("[data-brand-edge]")].map((e) => e.getAttribute("data-brand-edge")),
    );
    assert.ok(arcs.length > 0, "at least one cross-brand arc");
    const brands = await page.evaluate(() => [...document.querySelectorAll('g[data-kind="brand"]')].map((g) => g.dataset.nodeId.slice(6)));
    for (const a of arcs) {
      const [x, y] = a.split("|");
      assert.notEqual(x, y);
      assert.ok(brands.includes(x) && brands.includes(y), `${a} joins two drawn brands`);
    }
    const pairs = arcs.map((a) => a.split("|").sort().join("|"));
    assert.equal(new Set(pairs).size, pairs.length, `duplicate pair in ${arcs.join(", ")}`);
  });
});
