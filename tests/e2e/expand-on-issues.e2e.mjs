// guard: expand on issues only — cold load opens only products with an open issue; issue-free hubs
// are collapsed with their page count; Reset layout re-applies the rule.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { center, closeAll, coldGraph, hubShown, pagesOfHub, sleep } from "./_app.mjs";

const hubs = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('g[data-kind="product"], g[data-kind="glossary"]')].map((g) => {
      const id = g.dataset.nodeId;
      const [, b, p] = id.split(":");
      return {
        id,
        sev: g.dataset.sev ?? null,
        label: g.querySelector('[data-testid="hub-shown"]')?.textContent ?? null,
        pages: [...document.querySelectorAll('g[data-kind="page"]')].filter((x) => x.dataset.nodeId?.startsWith(`page:${b}:${p}:`)).length,
      };
    }),
  );

describe("guard: expand on issues only", () => {
  let ctx;
  let page;
  let cold;
  before(async () => {
    ({ context: ctx, page } = await coldGraph());
    cold = await hubs(page);
  });
  after(async () => {
    await ctx?.close();
    await closeAll();
  });

  test("open hubs all carry an open issue; issue-free hubs are collapsed with a page count", () => {
    assert.ok(cold.length > 0);
    for (const h of cold) {
      if (h.pages > 0) assert.ok(h.sev, `${h.id} is open but has no open issue`);
      if (!h.sev) {
        assert.equal(h.pages, 0, `${h.id} has no issue but is expanded`);
        assert.match(h.label ?? "", /^\d[\d,]* pages$/, `${h.id} shows its page count`);
      }
    }
    assert.ok(cold.some((h) => h.pages > 0), "some issue hubs open on load");
  });

  test("all 7 Bills products load collapsed with page counts", () => {
    const bills = cold.filter((h) => h.id.startsWith("hub:bills:"));
    assert.equal(bills.length, 7);
    for (const h of bills) {
      assert.equal(h.pages, 0, h.id);
      assert.match(h.label ?? "", /^\d[\d,]* pages$/, h.id);
    }
  });

  test("Reset layout re-applies the rule after manual expand/collapse", async () => {
    let p = await center(page, "hub:bills:consolidation");
    await page.mouse.dblclick(p.x, p.y);
    await sleep(900);
    assert.ok((await pagesOfHub(page, "bills", "consolidation")) > 0);
    p = await center(page, "hub:achieve:heloc");
    await page.mouse.dblclick(p.x, p.y);
    await sleep(900);
    assert.equal(await pagesOfHub(page, "achieve", "heloc"), 0);
    await page.click('[data-testid="reset-layout"]');
    await sleep(1200);
    const again = await hubs(page);
    assert.deepEqual(
      again.map((h) => [h.id, h.pages, h.label]),
      cold.map((h) => [h.id, h.pages, h.label]),
    );
    assert.match((await hubShown(page, "hub:achieve:heloc")) ?? "", /shown/);
  });
});
