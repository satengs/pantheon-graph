import { create } from "zustand";
import type { BrandId, ProductId } from "@/lib/graph/types";

export type StudioTab = "graph" | "validation" | "backlog" | "gate" | "states";

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
  query: string;
  setTab: (tab: StudioTab) => void;
  setExplode: (v: boolean) => void;
  setBrand: (v: "all" | BrandId) => void;
  setProduct: (v: "all" | ProductId) => void;
  setLayer: (v: "all" | "L1" | "L2") => void;
  setImpact: (v: "all" | "critical" | "high" | "medium" | "low") => void;
  selectNode: (id: string | null) => void;
  selectIssue: (id: string | null) => void;
  selectState: (code: string | null) => void;
  toggleIssueSelect: (id: string) => void;
  clearIssueSelect: () => void;
  setQuery: (q: string) => void;
};

export const useStudio = create<StudioState>((set) => ({
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
  query: "",
  setTab: (tab) => set({ tab }),
  setExplode: (explode) => set({ explode }),
  setBrand: (brand) => set({ brand }),
  setProduct: (product) => set({ product }),
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
  toggleIssueSelect: (id) =>
    set((s) => ({
      selectedIssueIds: s.selectedIssueIds.includes(id)
        ? s.selectedIssueIds.filter((x) => x !== id)
        : [...s.selectedIssueIds, id],
    })),
  clearIssueSelect: () => set({ selectedIssueIds: [] }),
  setQuery: (query) => set({ query }),
}));
