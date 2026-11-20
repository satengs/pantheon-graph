// Confirmed Pantheon totals stay C8 H10 M3 L0 and the to-verify / unverified
// counts are family-wide, independent of the source filter, so graph, Issues
// and Gate can share one helper and stay in agreement.
import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { familyRules } from "./_canvas";
import { severityTotals } from "@/lib/studio/issue-source";
import { evidenceQueue, evidenceMatchesSource, filterEvBySource } from "@/lib/graph/evidence-filter";
import { buildEvidenceIndex, normalizeEvidenceDoc, type EvidenceDoc, type EvidenceItem, type SourceFilter } from "@/lib/graph/evidence";
import { evidenceLabel } from "@/lib/graph/evidence-label";

const doc = normalizeEvidenceDoc(JSON.parse(readFileSync("public/data/evidence.json", "utf8"))) as EvidenceDoc;

describe("guard: evidence source totals", () => {
  const totals = severityTotals(familyRules());
  const queue = evidenceQueue(doc.items);

  test("confirmed Pantheon totals stay C8 H10 M3 L0", () => {
    expect([totals.critical, totals.high, totals.medium, totals.low]).toEqual([8, 10, 3, 0]);
  });

  // Data change pending sign-off (Evidence Brief 2026-11-20 + Funnel Fix Nov 19 sweep):
  // MS02/MS04 moved to confirmed; new to-verify rows are E163 and E170; MS03 stays to-verify;
  // E146 stays the only unverified row. Parent/brand tags below are the new real values.
  test("to-verify and unverified are the new Nov 20 rows plus MS03 and Googlebot", () => {
    expect(queue.toVerify).toBe(3);
    expect(queue.unverified).toBe(1);
    expect(doc.items.filter((i) => i.verification === "to_verify").map((i) => i.id).sort()).toEqual(["E163", "E170", "MS03"]);
    expect(doc.items.find((i) => i.verification === "unverified")?.id).toBe("E146");
  });

  test("the credit-card-statistics gap sits on three brand nodes but counts once at the parent", () => {
    const idx = buildEvidenceIndex(doc);
    const gap = doc.items.find((i) => i.id === "MS04")!;
    expect(gap.flags?.gap).toBe(true);
    expect(gap.scope).toBe("gap, no page");
    expect(gap.urls).toEqual([]);
    expect(gap.verification).toBe("confirmed");
    expect(gap.severity).toBe("medium");
    expect(gap.title).toMatch(/no dedicated statistics URL in any sitemap/i);
    expect(idx.forBrand("fdr")?.items.some((i) => i.id === "MS04")).toBe(true);
    expect(idx.forBrand("achieve")?.items.some((i) => i.id === "MS04")).toBe(true);
    expect(idx.forBrand("bills")?.items.some((i) => i.id === "MS04")).toBe(true);
    expect(idx.forAll()?.items.filter((i) => i.id === "MS04")).toHaveLength(1);
  });

  test("queue counts are unchanged under every source filter (headers stay stable)", () => {
    const filters: SourceFilter[] = ["both", "pantheon", "evidence-brief", "funnel-fix", "scout"];
    for (const f of filters) {
      expect(evidenceQueue(doc.items), f).toEqual(queue);
      expect(severityTotals(familyRules()), f).toEqual(totals);
    }
  });

  test("Funnel Fix filter shows confirmation-stamped rows, not new Funnel-only imports", () => {
    const rows = doc.items.filter((i) => evidenceMatchesSource(i, "funnel-fix"));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((i) => (i.confirmations ?? []).includes("funnel-fix"))).toBe(true);
    expect(rows.some((i) => i.id.startsWith("WR-FF"))).toBe(false);
  });

  test("Scout filter includes the five Market Scout rows", () => {
    const roll = filterEvBySource({ worst: "unrated", count: doc.items.length, pages: 0, items: doc.items as EvidenceItem[] }, "scout");
    expect(roll?.items.map((i) => i.id).sort()).toEqual(["MS01", "MS02", "MS03", "MS04", "MS05"]);
  });

  test("parent and brand evidence labels after the Nov 20 brief (data change pending sign-off)", () => {
    const idx = buildEvidenceIndex(doc);
    expect(evidenceLabel(idx.forAll()?.items)?.full).toBe("Evidence 167 · 14 critical");
    expect(evidenceLabel(idx.forBrand("fdr")?.items)?.full).toBe("Evidence 122 · 9 critical");
    expect(evidenceLabel(idx.forBrand("achieve")?.items)?.full).toBe("Evidence 44 · 4 critical");
    expect(evidenceLabel(idx.forBrand("bills")?.items)?.full).toBe("Evidence 8 · 1 critical");
    expect(evidenceLabel(idx.forHub("fdr", "apply")?.items)?.full).toBe("Evidence 10 · 1 critical");
  });

  test("every unmapped row has a visible reason (none expected after Apply remap)", () => {
    const unmapped = doc.items.filter((i) => i.match.kind === "unmapped");
    expect(unmapped.length).toBe(0);
    for (const i of unmapped) {
      expect(i.match.reason && i.match.reason.length > 0, i.id).toBeTruthy();
    }
  });

  test("FDR Apply hub carries the ten apply.freedomdebtrelief.com rows, including E70", () => {
    const idx = buildEvidenceIndex(doc);
    const ids = ["E59", "E70", "E74", "E79", "E88", "E98", "E99", "E111", "E115", "E131"];
    for (const id of ids) {
      const row = doc.items.find((i) => i.id === id)!;
      expect(row.brand).toBe("fdr");
      expect(row.owner).toBe("Apply");
      expect(row.match.kind).toBe("site-wide");
      expect(row.match.nodes).toEqual(["hub:fdr:apply"]);
    }
    const hub = idx.forHub("fdr", "apply");
    expect(ids.every((id) => hub?.items.some((i) => i.id === id))).toBe(true);
    expect(idx.forBrand("fdr")?.items.some((i) => i.id === "E70")).toBe(true);
    expect(hub?.items.some((i) => i.id === "E70" && i.severity === "critical")).toBe(true);
  });

  test("E133 sits on the FDR brand, not Achieve, and is confirmed critical (brief P0)", () => {
    const row = doc.items.find((i) => i.id === "E133")!;
    expect(row.brand).toBe("fdr");
    expect(row.match.kind).toBe("site-wide");
    expect(row.match.nodes).toEqual(["brand:fdr"]);
    expect(row.severity).toBe("critical");
    expect(row.verification).toBe("confirmed");
    expect(row.severityBasis).toMatch(/Evidence Brief 2026-11-20/);
    const idx = buildEvidenceIndex(doc);
    expect(idx.forBrand("fdr")?.items.some((i) => i.id === "E133")).toBe(true);
    expect(idx.forBrand("achieve")?.items.some((i) => i.id === "E133")).toBe(false);
  });

  test("Funnel-confirmed rows take Funnel impact; to-verify and unverified stay Unrated", () => {
    const confirmed = doc.items.filter((i) => (i.confirmations ?? []).includes("funnel-fix"));
    expect(confirmed.length).toBe(22);
    for (const i of confirmed) {
      expect(i.verification).toBe("confirmed");
      expect(i.severity).not.toBe("unrated");
      // E133 was upgraded to critical by the Nov 20 brief P0 after Funnel's high stamp.
      if (i.id === "E133") {
        expect(i.severityBasis).toMatch(/Evidence Brief 2026-11-20/);
        continue;
      }
      expect(i.severityBasis).toMatch(/Funnel Fix 2026-11-1[29]/);
    }
    expect(doc.items.filter((i) => i.verification === "to_verify").every((i) => i.severity === "unrated")).toBe(true);
    const bot = doc.items.find((i) => i.id === "E146")!;
    expect(bot.verification).toBe("unverified");
    expect(bot.severity).toBe("unrated");
  });

  test("UI strings contain no personal names or box paths", () => {
    const leak = /Satenik|Alea Hunt|\/workspace\//;
    for (const i of doc.items) {
      expect(leak.test(JSON.stringify(i)), i.id).toBe(false);
    }
  });

});
