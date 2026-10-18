// guard: page links S01/S06 only — the only family edges between pages/hubs/brands are S01/S06,
// and cross-brand L2 shows as one brand-to-brand edge per pair.
import { describe, expect, test } from "vitest";
import { coldGraph } from "./_canvas";

const ALLOWED = new Set(["S01", "S06"]);

describe("guard: page links S01/S06 only", () => {
  const { graph, sev } = coldGraph();
  const kind = new Map(graph.nodes.map((n) => [n.id, n.kind]));

  test("issue nodes on the canvas are S01 / S06 only", () => {
    const issues = graph.nodes.filter((n) => n.kind === "issue").map((n) => n.issueId);
    expect(issues.length).toBeGreaterThan(0);
    for (const c of issues) expect(ALLOWED.has(String(c)), String(c)).toBe(true);
  });

  test("every non-ownership edge belongs to S01 / S06", () => {
    for (const e of graph.edges.filter((e) => e.kind !== "owns")) {
      expect(ALLOWED.has(String(e.issueId)), `${e.id} (${e.kind}, ${e.issueId})`).toBe(true);
    }
  });

  test("no direct page-to-page edge", () => {
    for (const e of graph.edges) {
      expect(kind.get(e.source) === "page" && kind.get(e.target) === "page", e.id).toBe(false);
    }
  });

  test("ownership edges only go parent→brand→hub→page", () => {
    const ok = new Set(["parent>brand", "brand>product", "brand>glossary", "product>page", "glossary>page"]);
    for (const e of graph.edges.filter((e) => e.kind === "owns")) {
      expect(ok.has(`${kind.get(e.source)}>${kind.get(e.target)}`), e.id).toBe(true);
    }
  });

  test("cross-brand L2: one brand-to-brand edge per unordered pair", () => {
    const keys = sev.brandEdges.map((e) => [e.a, e.b].sort().join("|"));
    expect(keys.length).toBeGreaterThan(0);
    expect(new Set(keys).size).toBe(keys.length);
    for (const e of sev.brandEdges) {
      expect(e.a).not.toBe(e.b);
      for (const i of e.issues) expect(i.layer, i.code).toBe("L2");
    }
  });
});
