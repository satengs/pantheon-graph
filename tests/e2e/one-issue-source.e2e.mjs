// guard: one issue source — graph bar, Issues header and Gate show the same C/H/M/L totals, every
// rule has the same severity in Issues and Gate, live-HTML checks stay out of the totals.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { closeAll, coldGraph, issueRows, tab, totals } from "./_app.mjs";

const SEV = { C: "critical", H: "high", M: "medium", L: "low" };

describe("guard: one issue source", () => {
  let ctx;
  let page;
  const seen = {};
  before(async () => {
    ({ context: ctx, page } = await coldGraph());
    seen.graph = await totals(page, "graph-sev-totals");
    seen.badge = await page.evaluate(() => document.querySelector('g[data-node-id^="parent:"] [data-sev-badge]')?.getAttribute("data-sev-badge"));
    await tab(page, "Issues");
    await page.waitForSelector('[data-testid="issues-sev-totals"]');
    seen.issues = await totals(page, "issues-sev-totals");
    seen.rows = await issueRows(page);
    await tab(page, "Gate");
    await page.waitForSelector('[data-testid="gate-sev-totals"]');
    seen.gate = await totals(page, "gate-sev-totals");
    seen.gateRows = new Map(
      await page.evaluate(() =>
        [...document.querySelectorAll('[role=button][tabindex="0"]')]
          .map((r) => [r.querySelector("p")?.textContent?.split(" ")[0] ?? "", r.querySelector("[data-sev-pill]")?.getAttribute("data-sev-pill")])
          .filter(([c, s]) => c && s),
      ),
    );
  });
  after(async () => {
    await ctx?.close();
    await closeAll();
  });

  test("graph, Issues and Gate totals are identical", () => {
    assert.ok(seen.graph && seen.issues && seen.gate, JSON.stringify(seen));
    assert.deepEqual(seen.issues, seen.graph);
    assert.deepEqual(seen.gate, seen.graph);
  });

  test("snapshot: C8 H10 M3 L0 today", () => {
    assert.deepEqual(seen.graph, { C: 8, H: 10, M: 3, L: 0 });
  });

  test("the family node badge counts the same rules", () => {
    const want = Object.entries(seen.graph).filter(([, n]) => n > 0).map(([k, n]) => `${k}${n}`).join(" ");
    assert.equal(seen.badge, want);
  });

  test("Issues rule rows add up to the header; HTML checks are not in it", () => {
    const rules = [...seen.rows].filter(([, s]) => s !== "html");
    const count = (sev) => rules.filter(([, s]) => s === sev).length;
    assert.deepEqual({ C: count("critical"), H: count("high"), M: count("medium"), L: count("low") }, seen.issues);
    assert.equal(rules.filter(([, s]) => !Object.values(SEV).includes(s)).length, 0, `rows without a severity: ${JSON.stringify(rules)}`);
    for (const [code, s] of seen.rows) if (s === "html") assert.ok(!/^S\d+$/.test(code), `${code} is a rule, not an HTML check`);
  });

  test("per-issue severity matches between Issues and Gate", () => {
    assert.ok(seen.gateRows.size > 0, "Gate lists its open queue");
    for (const [code, s] of seen.gateRows) assert.equal(seen.rows.get(code), s, `${code}: Issues ${seen.rows.get(code)} vs Gate ${s}`);
    const ch = [...seen.rows].filter(([, s]) => s === "critical" || s === "high").map(([c]) => c).sort();
    assert.deepEqual([...seen.gateRows.keys()].sort(), ch, "Gate queue = every critical + high rule");
  });
});
