import { RULES } from "@/data/rules-seed";
import { ISSUE_PROOFS } from "@/data/issue-proofs";
import { ISSUE_ALIAS, edgeTag } from "@/lib/graph/aliases";
import type { GraphEdge } from "@/lib/graph/types";
import { BRAND_LABEL, PRODUCT_LABEL } from "@/lib/graph/types";

export const TREE_SUGGESTIONS: Array<{
  code: string;
  source: string;
  target: string;
  kind: GraphEdge["kind"];
}> = [
  { code: "S01", source: "hub:fdr:glossary", target: "hub:achieve:glossary", kind: "conflict" },
  { code: "S02", source: "hub:fdr:debt-relief", target: "hub:fdr:settlement", kind: "conflict" },
  { code: "S03", source: "hub:achieve:glossary", target: "hub:achieve:heloc", kind: "suggests" },
  { code: "S04", source: "hub:fdr:glossary", target: "hub:achieve:glossary", kind: "suggests" },
  { code: "S05", source: "brand:achieve", target: "hub:achieve:other", kind: "suggests" },
  { code: "S06", source: "brand:fdr", target: "brand:achieve", kind: "sameAs" },
  { code: "S07", source: "hub:fdr:debt-relief", target: "hub:achieve:heloc", kind: "suggests" },
  { code: "S08", source: "brand:achieve", target: "hub:achieve:heloc", kind: "suggests" },
  { code: "S09", source: "hub:achieve:hel", target: "hub:achieve:heloc", kind: "conflict" },
  { code: "S10", source: "hub:achieve:personal-loan", target: "hub:achieve:hel", kind: "conflict" },
  { code: "S11", source: "hub:achieve:personal-loan", target: "hub:achieve:debt-relief", kind: "suggests" },
  { code: "S12", source: "hub:achieve:debt-relief", target: "hub:achieve:personal-loan", kind: "suggests" },
  { code: "S13", source: "hub:fdr:debt-relief", target: "hub:achieve:debt-relief", kind: "conflict" },
  { code: "S21", source: "hub:fdr:debt-relief", target: "hub:achieve:heloc", kind: "suggests" },
  { code: "S22", source: "hub:fdr:debt-relief", target: "hub:achieve:debt-relief", kind: "conflict" },
  { code: "S23", source: "hub:fdr:heloc", target: "hub:achieve:heloc", kind: "conflict" },
  { code: "S24", source: "hub:achieve:debt-relief", target: "hub:fdr:debt-relief", kind: "suggests" },
  { code: "S25", source: "hub:fdr:glossary", target: "hub:achieve:personal-loan", kind: "suggests" },
  { code: "S26", source: "hub:achieve:glossary", target: "hub:fdr:glossary", kind: "suggests" },
  { code: "S27", source: "brand:achieve", target: "hub:achieve:other", kind: "suggests" },
  { code: "S28", source: "brand:fdr", target: "hub:fdr:other", kind: "conflict" },
  { code: "S29", source: "brand:fdr", target: "hub:fdr:other", kind: "suggests" },
  { code: "S30", source: "hub:fdr:other", target: "hub:achieve:other", kind: "suggests" },
  { code: "S31", source: "hub:fdr:other", target: "hub:fdr:debt-relief", kind: "conflict" },
  { code: "S32", source: "hub:achieve:hel", target: "hub:achieve:heloc", kind: "conflict" },
];

export function nodeLabel(id: string): string {
  if (id.startsWith("brand:")) {
    const b = id.slice(6);
    return b === "fdr" || b === "achieve" ? BRAND_LABEL[b] : id;
  }
  if (id.startsWith("hub:")) {
    const parts = id.split(":");
    const brand = parts[1] === "fdr" || parts[1] === "achieve" ? BRAND_LABEL[parts[1]] : parts[1];
    const product = parts[2] && parts[2] in PRODUCT_LABEL ? PRODUCT_LABEL[parts[2] as keyof typeof PRODUCT_LABEL] : parts[2];
    return `${brand} · ${product}`;
  }
  if (id.startsWith("issue:")) return id.slice(6);
  if (id.startsWith("page:")) return "Page";
  return id;
}

export type SuggestionRow = {
  code: string;
  alias: string;
  kind: GraphEdge["kind"];
  from: string;
  to: string;
  fromId: string;
  toId: string;
  layer: string;
  impact: string;
  status: string;
  proof: string;
  title: string;
  fix: string;
};

export function suggestionRows(): SuggestionRow[] {
  return TREE_SUGGESTIONS.map((t) => {
    const rule = RULES.find((r) => r.code === t.code);
    const proof = ISSUE_PROOFS[t.code];
    const shot = proof?.rows[0];
    return {
      code: t.code,
      alias: ISSUE_ALIAS[t.code] ?? t.code,
      kind: t.kind,
      from: nodeLabel(t.source),
      to: nodeLabel(t.target),
      fromId: t.source,
      toId: t.target,
      layer: rule?.layer ?? "L2",
      impact: rule?.impact ?? "medium",
      status: rule?.status ?? "open",
      proof: shot ? `${shot.h1} · ${shot.extra}` : proof?.conflict ?? rule?.reason ?? "",
      title: rule?.title ?? edgeTag(t.code),
      fix: rule?.fix ?? "",
    };
  });
}

export function formatSuggestionsMarkdown(rows: SuggestionRow[]): string {
  const head = "| ID | Type | Kind | From | To | Proof | Fix |";
  const sep = "|---|---|---|---|---|---|---|";
  const body = rows.map((r) => {
    const cell = (s: string) => s.replace(/\|/g, "/").replace(/\n/g, " ").slice(0, 180);
    return `| ${r.code} | ${cell(r.alias)} | ${r.kind} | ${cell(r.from)} | ${cell(r.to)} | ${cell(r.proof)} | ${cell(r.fix)} |`;
  });
  return [head, sep, ...body].join("\n");
}

export function formatSuggestionsJson(rows: SuggestionRow[]): string {
  return JSON.stringify(rows, null, 2);
}
