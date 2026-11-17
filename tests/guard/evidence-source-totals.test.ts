// Confirmed Pantheon totals stay C8 H10 M3 L0 and the to-verify / unverified
// counts are family-wide, independent of the source filter, so graph, Issues
// and Gate can share one helper and stay in agreement.
import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { familyRules } from "./_canvas";
import { severityTotals } from "@/lib/studio/issue-source";
import { evidenceQueue, evidenceMatchesSource, filterEvBySource } from "@/lib/graph/evidence-filter";
import { buildEvidenceIndex, normalizeEvidenceDoc, type EvidenceDoc, type EvidenceItem, type SourceFilter } from "@/lib/graph/evidence";

const doc = normalizeEvidenceDoc(JSON.parse(readFileSync("public/data/evidence.json", "utf8"))) as EvidenceDoc;

describe("guard: evidence source totals", () => {
  const totals = severityTotals(familyRules());
  const queue = evidenceQueue(doc.items);

  test("confirmed Pantheon totals stay C8 H10 M3 L0", () => {
    expect([totals.critical, totals.high, totals.medium, totals.low]).toEqual([8, 10, 3, 0]);
  });

  test("to-verify and unverified are the Scout pending rows plus Googlebot", () => {
    expect(queue.toVerify).toBe(3);
    expect(queue.unverified).toBe(1);
    expect(doc.items.filter((i) => i.verification === "to_verify").map((i) => i.id).sort()).toEqual(["MS02", "MS03", "MS04"]);
    expect(doc.items.find((i) => i.verification === "unverified")?.id).toBe("E146");
  });

  test("the credit-card-statistics gap sits on three brand nodes but counts once at the parent", () => {
    const idx = buildEvidenceIndex(doc);
    const gap = doc.items.find((i) => i.id === "MS04")!;
    expect(gap.flags?.gap).toBe(true);
    expect(gap.scope).toBe("gap, no page");
    expect(gap.urls).toEqual([]);
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
});
