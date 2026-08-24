import { crawl, pageUrl } from "@/data/crawl";
import { RULES } from "@/data/rules-seed";
import { edgeTag } from "@/lib/graph/aliases";
import type {
  BrandId,
  CrawlPage,
  GraphEdge,
  GraphNode,
  ProductId,
} from "@/lib/graph/types";
import { BRAND_LABEL, PRODUCT_LABEL } from "@/lib/graph/types";

export const PRODUCT_ORDER: ProductId[] = [
  "debt-relief",
  "settlement",
  "heloc",
  "hel",
  "personal-loan",
  "consolidation",
  "glossary",
  "other",
];

const OWNER: Partial<Record<ProductId, BrandId>> = {
  "debt-relief": "fdr",
  settlement: "fdr",
  heloc: "achieve",
  hel: "achieve",
  "personal-loan": "achieve",
};

export function countPages(brand?: BrandId, product?: ProductId): number {
  return crawl.pages.filter((p) => {
    if (brand && p.b !== brand) return false;
    if (product && p.p !== product) return false;
    return true;
  }).length;
}

export function jaccard(a: string, b: string): number {
  const ta = new Set(a.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  const tb = new Set(b.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  let inter = 0;
  ta.forEach((t) => {
    if (tb.has(t)) inter += 1;
  });
  const union = ta.size + tb.size - inter;
  return union === 0 ? 0 : inter / union;
}

export const FDR_TONE = [
  "settlement",
  "negotiate",
  "enrolled",
  "program",
  "hardship",
  "unsecured",
  "certified",
  "resolve",
];
export const ACHIEVE_TONE = [
  "member",
  "heloc",
  "equity",
  "apr",
  "draw",
  "origination",
  "personalized",
  "lending",
];

export function toneRatio(text: string, brand: BrandId): { ratio: number; off: number; on: number } {
  const tokens = text.toLowerCase().split(/[^a-z0-9]+/);
  const mine = brand === "fdr" ? FDR_TONE : ACHIEVE_TONE;
  const theirs = brand === "fdr" ? ACHIEVE_TONE : FDR_TONE;
  const on = tokens.filter((t) => mine.includes(t)).length;
  const off = tokens.filter((t) => theirs.includes(t)).length;
  const denom = on + off;
  return { ratio: denom === 0 ? 1 : on / denom, off, on };
}

export function mcpShort(node: GraphNode): string {
  const issue = node.issueId ? RULES.find((i) => i.id === node.issueId) : undefined;
  const owner =
    node.brand && node.product && OWNER[node.product] === node.brand
      ? "canonical-owner"
      : node.brand && node.product && OWNER[node.product]
        ? "not-owner"
        : "shared";
  const lines = [
    `# ${node.label}`,
    `@id: origin:${node.id}`,
    `@kind: ${node.kind}`,
    node.brand ? `brand: ${BRAND_LABEL[node.brand]}` : null,
    node.product ? `product: ${PRODUCT_LABEL[node.product]}` : null,
    node.count != null ? `pages: ${node.count}` : null,
    node.url ? `url: ${node.url}` : null,
    node.kind === "product" ? `ownership: ${owner}` : null,
    issue
      ? `issue: ${issue.code} ${issue.title}\nreason: ${issue.reason}\nfix: ${issue.fix}`
      : null,
    node.kind === "glossary"
      ? `sameAs-policy: one canonical owner; stub the other with sameAs`
      : null,
  ];
  return lines.filter(Boolean).join("\n");
}

const EXPLODE_CAP = 28;

function hubId(brand: BrandId, product: ProductId) {
  return `hub:${brand}:${product}`;
}

export function buildGraph(opts: {
  explode: boolean;
  brand: "all" | BrandId;
  product: "all" | ProductId;
  layer: "all" | "L1" | "L2";
}): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const addN = (n: GraphNode) => nodes.push(n);
  const addE = (e: GraphEdge) => edges.push(e);

  const brands: BrandId[] =
    opts.brand === "all" ? ["fdr", "achieve"] : [opts.brand];

  for (const b of brands) {
    addN({
      id: `brand:${b}`,
      label: BRAND_LABEL[b],
      kind: "brand",
      brand: b,
      count: countPages(b),
      url: b === "fdr" ? "https://www.freedomdebtrelief.com/" : "https://www.achieve.com/",
    });
  }

  for (const b of brands) {
    for (const p of PRODUCT_ORDER) {
      if (opts.product !== "all" && opts.product !== p) continue;
      const n = countPages(b, p);
      if (n === 0) continue;
      const id = hubId(b, p);
      addN({
        id,
        label: `${PRODUCT_LABEL[p]}`,
        kind: p === "glossary" ? "glossary" : "product",
        brand: b,
        product: p,
        count: n,
      });
      addE({
        id: `owns:${b}:${p}`,
        source: `brand:${b}`,
        target: id,
        kind: "owns",
        label: "owns",
      });
    }
  }

  if (brands.includes("fdr") && brands.includes("achieve")) {
    const pairs =
      opts.product === "all" || opts.product === "glossary"
        ? crawl.glossaryOverlap.length
        : 0;
    if (pairs > 0 && nodes.some((n) => n.id === "hub:fdr:glossary") && nodes.some((n) => n.id === "hub:achieve:glossary")) {
      addE({
        id: "conflict:glossary",
        source: "hub:fdr:glossary",
        target: "hub:achieve:glossary",
        kind: "conflict",
        label: edgeTag("S01"),
        issueId: "S01",
      });
    }
    if (
      nodes.some((n) => n.id === "hub:fdr:debt-relief") &&
      nodes.some((n) => n.id === "hub:achieve:debt-relief")
    ) {
      addE({
        id: "conflict:debt-relief",
        source: "hub:fdr:debt-relief",
        target: "hub:achieve:debt-relief",
        kind: "conflict",
        label: edgeTag("S02"),
        issueId: "S02",
      });
    }
    if (
      nodes.some((n) => n.id === "hub:achieve:hel") &&
      nodes.some((n) => n.id === "hub:achieve:heloc")
    ) {
      addE({
        id: "conflict:hel-heloc",
        source: "hub:achieve:hel",
        target: "hub:achieve:heloc",
        kind: "conflict",
        label: edgeTag("S09"),
        issueId: "S09",
      });
    }
    addE({
      id: "sameAs:org",
      source: "brand:fdr",
      target: "brand:achieve",
      kind: "sameAs",
      label: edgeTag("S06"),
      issueId: "S06",
    });
    if (
      nodes.some((n) => n.id === "hub:fdr:debt-relief") &&
      nodes.some((n) => n.id === "hub:fdr:settlement")
    ) {
      addE({
        id: "conflict:relief-settlement",
        source: "hub:fdr:debt-relief",
        target: "hub:fdr:settlement",
        kind: "conflict",
        label: edgeTag("S02"),
        issueId: "S02",
      });
    }
  }

  const showL2 = opts.layer === "all" || opts.layer === "L2";
  if (!showL2) {
    const drop = new Set(edges.filter((e) => e.kind === "conflict" || e.kind === "sameAs").map((e) => e.id));
    for (let i = edges.length - 1; i >= 0; i--) {
      if (drop.has(edges[i]!.id)) edges.splice(i, 1);
    }
  }

  if (opts.explode) {
    const hubs = nodes.filter((n) => n.kind === "product" || n.kind === "glossary");
    for (const hub of hubs) {
      if (!hub.brand || !hub.product) continue;
      const pages = crawl.pages.filter((p) => p.b === hub.brand && p.p === hub.product);
      const shown: CrawlPage[] = pages.slice(0, EXPLODE_CAP);
      shown.forEach((p, i) => {
        const url = pageUrl(p);
        const id = `page:${hub.brand}:${hub.product}:${i}`;
        addN({
          id,
          label: p.path.replace(/\/$/, "").split("/").filter(Boolean).slice(-1)[0] || "/",
          kind: "page",
          brand: hub.brand,
          product: hub.product,
          url,
        });
        addE({
          id: `has:${id}`,
          source: hub.id,
          target: id,
          kind: "owns",
          label: "page",
        });
      });
    }
  }

  return { nodes, edges };
}
