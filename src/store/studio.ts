import { create } from "zustand";
import type { BrandId, ProductId } from "@/lib/graph/types";

export type StudioTab = "graph" | "explore" | "validation" | "issues" | "rules" | "gate" | "states" | "config";
export type GraphLayout = "tree" | "circle" | "breadthfirst" | "grid";
export type Maximized = null | "graph" | "states" | "validation" | "explore";

type StudioState = {
  tab: StudioTab;
  explode: boolean;
  brand: "all" | BrandId;
  product: "all" | ProductId;
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
  setTab: (tab: StudioTab) => void;
  setExplode: (v: boolean) => void;
  setBrand: (v: "all" | BrandId) => void;
  setProduct: (v: "all" | ProductId) => void;
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
};

export const useStudio = create<StudioState>((set, get) => ({
  tab: "states",
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
  setTab: (tab) => set({ tab }),
  setExplode: (explode) => set({ explode }),
  setBrand: (brand) => set({ brand, selectedState: null }),
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
}));
