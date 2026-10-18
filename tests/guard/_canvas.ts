/**
 * The graph exactly as the canvas builds it on a cold load (GraphCanvas.tsx): store defaults,
 * one issue source (familyIssues) -> severity index -> issueHubs -> buildGraph.
 */
import { buildGraph } from "@/lib/graph/model";
import { buildSeverityIndex } from "@/lib/graph/severity";
import { familyIssues } from "@/lib/studio/issue-source";
import { useStudio } from "@/store/studio";

export function coldState() {
  const s = useStudio.getState();
  return {
    explode: s.explode,
    brand: s.brand,
    product: s.product,
    layer: s.layer,
    includeParent: s.includeParent,
    org: s.graphOrg ?? undefined,
    codes: s.attachedRuleCodes,
    parentSlug: s.parentSlug,
    graphOrg: s.graphOrg,
  };
}

export function familyRules() {
  const s = coldState();
  return familyIssues({ codes: s.codes, org: s.graphOrg, parentSlug: s.parentSlug });
}

export function coldGraph(over: { expandIds?: string[]; collapsedIds?: string[] } = {}) {
  const s = coldState();
  const rules = familyIssues({ codes: s.codes, org: s.graphOrg, parentSlug: s.parentSlug, brand: s.brand, product: s.product, layer: s.layer });
  const sev = buildSeverityIndex(rules);
  const graph = buildGraph({
    explode: s.explode,
    brand: s.brand,
    product: s.product,
    layer: s.layer,
    expandIds: over.expandIds ?? [],
    collapsedIds: over.collapsedIds ?? [],
    includeParent: s.includeParent,
    org: s.org,
    // The seeded family attaches its rule codes at runtime (listOrgs); offline, the family's
    // open rules from the same issue source stand in for them.
    ruleCodes: s.codes.length ? s.codes : rules.map((r) => r.code),
    issueHubs: sev.issueHubs,
  });
  return { graph, sev, rules };
}
