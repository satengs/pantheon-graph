// guard: expand on issues only — a cold load opens only hubs that (or whose pages) carry an open
// rule; issue-free hubs load collapsed with their page count; double-click overrides both ways.
import { describe, expect, test } from "vitest";
import { coldGraph } from "./_canvas";

describe("guard: expand on issues only", () => {
  const { graph, sev } = coldGraph();
  const hubs = graph.nodes.filter((n) => n.kind === "product" || n.kind === "glossary");
  const pagesOf = (id: string, g = graph) =>
    g.edges.filter((e) => e.source === id && g.nodes.find((n) => n.id === e.target)?.kind === "page").length;
  const issueHubs = new Set(sev.issueHubs);

  test("issue hubs are open, every other hub is collapsed but keeps its page count", () => {
    expect(hubs.length).toBeGreaterThan(0);
    for (const h of hubs) {
      if (issueHubs.has(h.id) && (h.count ?? 0) > 0) expect(pagesOf(h.id), `${h.id} should be open`).toBeGreaterThan(0);
      if (!issueHubs.has(h.id)) {
        expect(pagesOf(h.id), `${h.id} should be collapsed`).toBe(0);
        if (h.id.startsWith("hub:bills:")) expect(h.count ?? 0, `${h.id} page count`).toBeGreaterThan(0);
      }
    }
  });

  test("Bills has no open issue, so all 7 Bills products load collapsed", () => {
    const bills = hubs.filter((h) => h.brand === "bills");
    expect(bills.length).toBe(7);
    for (const h of bills) {
      expect(issueHubs.has(h.id)).toBe(false);
      expect(pagesOf(h.id)).toBe(0);
      expect(h.count ?? 0).toBeGreaterThan(0);
    }
  });

  test("expandIds opens an issue-free hub; collapsedIds closes an issue hub", () => {
    const open = coldGraph({ expandIds: ["hub:bills:consolidation"] }).graph;
    expect(pagesOf("hub:bills:consolidation", open)).toBeGreaterThan(0);
    const anIssueHub = hubs.find((h) => issueHubs.has(h.id) && pagesOf(h.id) > 0)!;
    const closed = coldGraph({ collapsedIds: [anIssueHub.id] }).graph;
    expect(pagesOf(anIssueHub.id, closed)).toBe(0);
  });

  test("clearing manual overrides (Reset layout) restores the cold-load graph", () => {
    const again = coldGraph({ expandIds: [], collapsedIds: [] }).graph;
    expect(again.nodes.map((n) => n.id).sort()).toEqual(graph.nodes.map((n) => n.id).sort());
  });
});
