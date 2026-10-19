// guard: one issue source — graph, Issues and Gate read the same open rules with the same severity.
import { describe, expect, test } from "vitest";
import { RULES } from "@/data/rules-seed";
import { buildSeverityIndex } from "@/lib/graph/severity";
import { severityTotals } from "@/lib/studio/issue-source";
import { crawlFindings } from "@/lib/studio/issue-source";
import { issueCategories } from "@/lib/studio/rule-pages";
import { familyRules } from "./_canvas";

const sevOf = (r: { impact: string }) => r.impact;

describe("guard: one issue source", () => {
  const rules = familyRules();
  const totals = severityTotals(rules);

  test("graph family node == Issues == Gate totals (same rule set)", () => {
    const all = buildSeverityIndex(rules).forAll();
    expect(all).not.toBeNull();
    const graphTotals = severityTotals(all!.issues);
    // Issues list: rule rows built from the same rules (+ crawl findings), html rows excluded.
    const cats = issueCategories([], rules, crawlFindings()).filter((c) => c.source === "rule");
    const issuesTotals = severityTotals(cats.map((c) => ({ impact: c.impact as (typeof rules)[number]["impact"] })));
    expect(graphTotals).toEqual(totals);
    expect(issuesTotals).toEqual(totals);
    expect(new Set(cats.map((c) => c.code))).toEqual(new Set(rules.map((r) => r.code)));
    expect(new Set(all!.issues.map((i) => i.code))).toEqual(new Set(rules.map((r) => r.code)));
  });

  test("snapshot: today's family totals are C8 H10 M3 L0", () => {
    expect([totals.critical, totals.high, totals.medium, totals.low]).toEqual([8, 10, 3, 0]);
  });

  test("per-issue severity is the rule's impact in every view", () => {
    const idx = buildSeverityIndex(rules);
    const byCode = new Map(RULES.map((r) => [r.code, r.impact]));
    for (const i of idx.forAll()!.issues) expect(i.impact, i.code).toBe(byCode.get(i.code));
    for (const c of issueCategories([], rules, crawlFindings()).filter((c) => c.source === "rule"))
      expect(c.impact, c.code).toBe(byCode.get(c.code));
    for (const r of rules) expect(sevOf(r), r.code).toBe(byCode.get(r.code));
  });

  test("live-HTML checks are tagged html, carry no severity and stay out of the totals", () => {
    const fake = [
      { id: "h1", code: "MAIN", title: "No <main> landmark", url: "https://www.freedomdebtrelief.com/debt-relief/" },
      { id: "h2", code: "REL", title: "Related block", url: "https://www.achieve.com/heloc/" },
    ];
    const cats = issueCategories(fake, rules, crawlFindings());
    const html = cats.filter((c) => c.source === "html");
    expect(html.map((c) => c.code).sort()).toEqual(["MAIN", "REL"]);
    for (const c of html) expect(c.impact).toBe("");
    const ruleRows = cats.filter((c) => c.source === "rule");
    expect(severityTotals(ruleRows.map((c) => ({ impact: c.impact as "critical" })))).toEqual(totals);
    expect(rules.some((r) => r.code === "MAIN" || r.code === "REL")).toBe(false);
  });
});
