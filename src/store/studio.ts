import { create } from "zustand";
import type { BrandId } from "@/lib/graph/types";
import type { GraphOrg } from "@/lib/graph/model";
import { pickIssueForFamily } from "@/lib/org/catalog";

export type StudioTab =
  | "graph"
  | "explore"
  | "recommend"
  | "validation"
  | "issues"
  | "rules"
  | "gate"
  | "states"
  | "config"
  | "companies";
export type GraphLayout = "tree" | "circle" | "breadthfirst" | "grid";
export type Maximized = null | "graph" | "states" | "validation" | "explore";

export type FamilyParent = {
  id: string;
  slug: string;
  name: string;
  ruleCodes: string[];
  includeInGraph: boolean;
};

export type FamilyBrand = {
  id: string;
  slug: string;
  name: string;
  parentId: string | null;
  website: string;
  products: string[];
  pageCount?: number;
};

type StudioState = {
  tab: StudioTab;
  explode: boolean;
  brand: "all" | BrandId;
  product: "all" | string;
  layer: "all" | "L1" | "L2";
  impact: "all" | "critical" | "high" | "medium" | "low";
  selectedNodeId: string | null;
  selectedIssueId: string | null;
  selectedIssueIds: string[];
  selectedState: string | null;
  hoveredIssueId: string | null;
  selectedFindingId: string | null;
  query: string;
  sortKey: string;
  sortDir: "asc" | "desc";
  graphLayout: GraphLayout;
  maximized: Maximized;
  graphFocusStack: string[];
  includeParent: boolean;
  parentSlug: string;
  parentId: string;
  graphOrg: GraphOrg | null;
  registerOpen: boolean;
  familyEpoch: number;
  attachedRuleCodes: string[];
  parents: FamilyParent[];
  allBrands: FamilyBrand[];
  setTab: (tab: StudioTab) => void;
  setExplode: (v: boolean) => void;
  setBrand: (v: "all" | BrandId) => void;
  setProduct: (v: "all" | string) => void;
  setLayer: (v: "all" | "L1" | "L2") => void;
  setImpact: (v: "all" | "critical" | "high" | "medium" | "low") => void;
  selectNode: (id: string | null) => void;
  selectIssue: (id: string | null) => void;
  selectState: (code: string | null) => void;
  hoverIssue: (id: string | null) => void;
  selectFinding: (id: string | null) => void;
  toggleIssueSelect: (id: string) => void;
  clearIssueSelect: () => void;
  setQuery: (q: string) => void;
  setSort: (key: string) => void;
  setGraphLayout: (v: GraphLayout) => void;
  setMaximized: (v: Maximized) => void;
  pushGraphFocus: (id: string) => void;
  popGraphFocus: () => void;
  setIncludeParent: (v: boolean) => void;
  setParentSlug: (v: string) => void;
  setGraphOrg: (v: GraphOrg | null) => void;
  setRegisterOpen: (v: boolean) => void;
  bumpFamily: () => void;
  applyFamilyContext: (input: {
    parents: FamilyParent[];
    parentId: string;
    allBrands: FamilyBrand[];
    includeParent?: boolean;
  }) => void;
  selectParent: (parentId: string) => void;
};

function graphFrom(parent: FamilyParent | undefined, brands: FamilyBrand[]): GraphOrg {
  return {
    parent: parent ? { slug: parent.slug, name: parent.name } : null,
    brands: brands.map((b) => ({
      slug: b.slug,
      name: b.name,
      url: b.website,
      products: b.products,
      pageCount: b.pageCount,
    })),
  };
}

export function familyContextFrom(d: {
  parents: Array<{ id: string; slug: string; name: string; ruleCodes: string[]; includeInGraph: boolean }>;
  parent: { id: string; includeInGraph: boolean } | null;
  brands: Array<{
    id: string;
    slug: string;
    name: string;
    parentId: string | null;
    website: string;
    products: string[];
    probe: { pageCount?: number };
  }>;
  allBrands?: Array<{
    id: string;
    slug: string;
    name: string;
    parentId: string | null;
    website: string;
    products: string[];
    probe: { pageCount?: number };
  }>;
}) {
  return {
    parents: d.parents.map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      ruleCodes: p.ruleCodes,
      includeInGraph: p.includeInGraph,
    })),
    parentId: d.parent?.id ?? d.parents[0]?.id ?? "",
    allBrands: (d.allBrands ?? d.brands).map((b) => ({
      id: b.id,
      slug: b.slug,
      name: b.name,
      parentId: b.parentId,
      website: b.website,
      products: b.products,
      pageCount: b.probe.pageCount,
    })),
    includeParent: d.parent?.includeInGraph,
  };
}

export const useStudio = create<StudioState>((set, get) => ({
  tab: "companies",
  explode: false,
  brand: "all",
  product: "all",
  layer: "all",
  impact: "all",
  selectedNodeId: null,
  selectedIssueId: "S01",
  selectedIssueIds: [],
  selectedState: null,
  hoveredIssueId: null,
  selectedFindingId: null,
  query: "",
  sortKey: "code",
  sortDir: "asc",
  graphLayout: "tree",
  maximized: null,
  graphFocusStack: [],
  includeParent: true,
  parentSlug: "pantheon",
  parentId: "",
  graphOrg: null,
  registerOpen: false,
  familyEpoch: 0,
  attachedRuleCodes: [],
  parents: [],
  allBrands: [],
  setTab: (tab) => set({ tab }),
  setExplode: (explode) => set({ explode }),
  setBrand: (brand) =>
    set((s) => {
      const pool =
        brand === "all"
          ? s.allBrands.filter((b) => !s.parentId || b.parentId === s.parentId)
          : s.allBrands.filter((b) => b.slug === brand);
      const allowed = new Set(pool.flatMap((b) => b.products));
      return {
        brand,
        selectedState: null,
        product: s.product !== "all" && allowed.has(s.product) ? s.product : "all",
      };
    }),
  setProduct: (product) => set({ product, selectedState: null }),
  setLayer: (layer) => set({ layer }),
  setImpact: (impact) => set({ impact }),
  selectNode: (selectedNodeId) => {
    if (selectedNodeId?.startsWith("issue:")) {
      set({
        selectedNodeId,
        selectedIssueId: selectedNodeId.replace("issue:", ""),
        selectedState: null,
      });
    } else {
      set({ selectedNodeId, selectedState: null });
    }
  },
  selectIssue: (selectedIssueId) =>
    set({
      selectedIssueId,
      selectedNodeId: selectedIssueId ? `issue:${selectedIssueId}` : null,
      selectedState: null,
    }),
  selectState: (selectedState) => set({ selectedState, selectedNodeId: null }),
  hoverIssue: (hoveredIssueId) => set({ hoveredIssueId }),
  selectFinding: (selectedFindingId) => set({ selectedFindingId, selectedState: null }),
  toggleIssueSelect: (id) =>
    set((s) => ({
      selectedIssueIds: s.selectedIssueIds.includes(id)
        ? s.selectedIssueIds.filter((x) => x !== id)
        : [...s.selectedIssueIds, id],
    })),
  clearIssueSelect: () => set({ selectedIssueIds: [] }),
  setQuery: (query) => set({ query }),
  setSort: (key) => {
    const cur = get();
    if (cur.sortKey === key) set({ sortDir: cur.sortDir === "asc" ? "desc" : "asc" });
    else set({ sortKey: key, sortDir: "asc" });
  },
  setGraphLayout: (graphLayout) => set({ graphLayout }),
  setMaximized: (maximized) => set({ maximized }),
  pushGraphFocus: (id) =>
    set((s) => (s.graphFocusStack.includes(id) ? s : { graphFocusStack: [...s.graphFocusStack, id] })),
  popGraphFocus: () => set((s) => ({ graphFocusStack: s.graphFocusStack.slice(0, -1) })),
  setIncludeParent: (includeParent) => set({ includeParent }),
  setParentSlug: (parentSlug) => set({ parentSlug }),
  setGraphOrg: (graphOrg) => set({ graphOrg }),
  setRegisterOpen: (registerOpen) => set({ registerOpen }),
  bumpFamily: () => set((s) => ({ familyEpoch: s.familyEpoch + 1 })),
  applyFamilyContext: ({ parents, parentId, allBrands, includeParent }) =>
    set((s) => {
      const parent = parents.find((p) => p.id === parentId) ?? parents[0];
      const brands = allBrands.filter((b) => !parent || b.parentId === parent.id);
      const codes = parent?.ruleCodes ?? [];
      const graphOrg = graphFrom(parent, brands);
      const issue = pickIssueForFamily(codes, s.selectedIssueId, graphOrg, parent?.slug);
      return {
        parents,
        parentId: parent?.id ?? "",
        parentSlug: parent?.slug ?? "",
        allBrands,
        attachedRuleCodes: codes,
        graphOrg,
        includeParent: includeParent ?? parent?.includeInGraph ?? s.includeParent,
        brand: "all",
        product: (() => {
          const allowed = new Set(brands.flatMap((b) => b.products));
          return s.product !== "all" && allowed.has(s.product) ? s.product : "all";
        })(),
        selectedIssueId: issue,
        selectedNodeId: issue ? `issue:${issue}` : null,
        selectedFindingId: null,
        graphFocusStack: [],
      };
    }),
  selectParent: (parentId) => {
    const s = get();
    const parent = s.parents.find((p) => p.id === parentId);
    if (!parent) return;
    s.applyFamilyContext({
      parents: s.parents,
      parentId,
      allBrands: s.allBrands,
      includeParent: parent.includeInGraph,
    });
  },
}));
