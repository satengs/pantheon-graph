export type MapBranch = { label: string; kids?: string[] };
export type MapTree = { root: string; branches: MapBranch[] };

export type IssueMind = {
  observed?: MapTree;
  intended: MapTree;
};

/** Entity maps for issues where Google/AI collapse is the proof. */
export const ISSUE_MAPS: Record<string, IssueMind> = {
  S01: {
    observed: {
      root: "Debt Relief (DefinedTerm)",
      branches: [
        { label: "FDR glossary", kids: ["self-canonical", "DefinedTerm JSON-LD"] },
        { label: "Achieve glossary", kids: ["self-canonical", "same H1"] },
      ],
    },
    intended: {
      root: "One DefinedTerm owner",
      branches: [
        { label: "Owner origin", kids: ["canonical + schema"] },
        { label: "Sibling origin", kids: ["canonical or 301 to owner"] },
      ],
    },
  },
  S02: {
    observed: {
      root: "One program",
      branches: [
        { label: "/debt-relief/", kids: ["copy treats settlement as synonym"] },
        { label: "/debt-solutions/debt-settlement/", kids: ["method page, still aliased"] },
      ],
    },
    intended: {
      root: "Program ≠ method",
      branches: [
        { label: "Debt relief", kids: ["overview Service"] },
        { label: "Debt settlement", kids: ["one method"] },
        { label: "Pros-and-cons FAQ", kids: ["article URL, not the product"] },
      ],
    },
  },
  S06: {
    observed: {
      root: "Debt Relief Services",
      branches: [
        { label: "Freedom Debt Relief", kids: ["NMLS 1248929", "settlement + consolidation"] },
        { label: "Achieve", kids: ["affiliate of FDR", "same NMLS", "personal finance"] },
        { label: "Registration", kids: ["CCFPL numbers on FDR"] },
      ],
    },
    intended: {
      root: "Pantheon (holding)",
      branches: [
        { label: "FDR", kids: ["settlement Service", "program fees", "no NMLS"] },
        { label: "Achieve", kids: ["HELOC / HEL / personal loans", "NMLS on loan URLs only"] },
        { label: "About / relationship", kids: ["affiliate sameAs here only"] },
      ],
    },
  },
  S12: {
    observed: {
      root: "NMLS 1248929",
      branches: [
        { label: "FDR", kids: ["debt relief", "Google cites this ID"] },
        { label: "Achieve", kids: ["same ID in AI Overview", "debt-relief template"] },
      ],
    },
    intended: {
      root: "License follows product type",
      branches: [
        { label: "LoanOrCredit URLs", kids: ["NMLS + origination"] },
        { label: "Settlement / relief URLs", kids: ["program-fee language", "no NMLS"] },
      ],
    },
  },
  S22: {
    observed: {
      root: "Debt Relief Services",
      branches: [
        { label: "FDR /debt-relief/", kids: ["Service"] },
        { label: "Achieve /debt-relief", kids: ["Apply FREE — folded into FDR"] },
      ],
    },
    intended: {
      root: "Two products, two orgs",
      branches: [
        { label: "FDR Service", kids: ["keep /debt-relief/"] },
        { label: "Achieve Service", kids: ["keep /debt-relief", "do not 301"] },
      ],
    },
  },
  S32: {
    observed: {
      root: "Home equity (one product)",
      branches: [
        { label: "/heloc", kids: ["line of credit"] },
        { label: "/home-equity-loan", kids: ["copy talks like a HELOC"] },
      ],
    },
    intended: {
      root: "Two loan types",
      branches: [
        { label: "HELOC", kids: ["revolving", "draw period"] },
        { label: "Home equity loan", kids: ["closed-end", "lump sum"] },
      ],
    },
  },
};
