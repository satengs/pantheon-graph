import { crawl, pageUrl } from "@/data/crawl";
import { RULES } from "@/data/rules-seed";
import { isHiddenUiCode } from "@/lib/studio/query";
import { edgeTag } from "@/lib/graph/aliases";
import { TREE_SUGGESTIONS } from "@/lib/graph/suggestions";
import type {
  BrandId,
  GraphEdge,
  GraphNode,
  ProductId,
} from "@/lib/graph/types";
import { BRAND_HOST, brandLabel, PRODUCT_LABEL, productLabel } from "@/lib/graph/types";

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
  if (brand !== "fdr" && brand !== "achieve") return { ratio: 1, off: 0, on: 0 };
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
    node.brand ? `brand: ${brandLabel(node.brand)}` : null,
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
    node.kind === "parent" ? `role: holding company` : null,
  ];
  return lines.filter(Boolean).join("\n");
}

const EXPLODE_CAP = 28;
const EXPAND_PAGE_CAP = 10;

function hubId(brand: BrandId, product: string) {
  return `hub:${brand}:${product}`;
}

function parseBrandId(id: string): BrandId | null {
  if (id.startsWith("brand:")) return id.slice(6);
  return null;
}

function parseHubId(id: string): { brand: BrandId; product: ProductId } | null {
  const m = /^hub:([a-z0-9-]+):([a-z0-9-]+)$/.exec(id);
  if (!m) return null;
  const product = m[2] as ProductId;
  if (!(product in PRODUCT_LABEL)) return null;
  return { brand: m[1]!, product };
}

export type GraphOrgBrand = {
  slug: string;
  name: string;
  url: string;
  products: string[];
  pageCount?: number;
};

export type GraphOrg = {
  parent: { slug: string; name: string; url?: string } | null;
  brands: GraphOrgBrand[];
};

const FALLBACK_ORG: GraphOrg = {
  parent: { slug: "pantheon", name: "Pantheon" },
  brands: [
    {
      slug: "fdr",
      name: "Freedom Debt Relief",
      url: "https://www.freedomdebtrelief.com/",
      products: ["debt-relief", "settlement", "glossary"],
    },
    {
      slug: "achieve",
      name: "Achieve",
      url: "https://www.achieve.com/",
      products: ["heloc", "hel", "personal-loan", "glossary"],
    },
  ],
};

export function buildGraph(opts: {
  explode: boolean;
  brand: "all" | BrandId;
  product: "all" | ProductId | string;
  layer: "all" | "L1" | "L2";
  expandIds?: string[];
  includeParent?: boolean;
  org?: GraphOrg;
  ruleCodes?: string[];
}): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const addN = (n: GraphNode) => {
    if (nodes.some((x) => x.id === n.id)) return;
    nodes.push(n);
  };
  const addE = (e: GraphEdge) => {
    if (edges.some((x) => x.id === e.id)) return;
    edges.push(e);
  };
  const has = (id: string) => nodes.some((n) => n.id === id);

  const family = opts.org ?? FALLBACK_ORG;
  const orgBrands =
    opts.brand === "all" || (family.parent && opts.brand === family.parent.slug)
      ? family.brands
      : family.brands.filter((b) => b.slug === opts.brand);
  const brands: BrandId[] = (opts.org ? orgBrands : orgBrands.length ? orgBrands : FALLBACK_ORG.brands).map((b) => b.slug);
  const meta = new Map(family.brands.map((b) => [b.slug, b]));

  const addBrand = (b: BrandId) => {
    const info = meta.get(b);
    addN({
      id: `brand:${b}`,
      label: info?.name ?? brandLabel(b),
      kind: "brand",
      brand: b,
      count: countPages(b) || info?.pageCount || 0,
      url: info?.url || BRAND_HOST[b] || undefined,
    });
  };

  const addHub = (b: BrandId, p: ProductId) => {
    const n = countPages(b, p);
    addN({
      id: hubId(b, p),
      label: productLabel(p),
      kind: p === "glossary" ? "glossary" : "product",
      brand: b,
      product: p,
      count: n,
    });
    addE({
      id: `owns:${b}:${p}`,
      source: `brand:${b}`,
      target: hubId(b, p),
      kind: "owns",
      label: "owns",
    });
  };

  function ensureNode(id: string) {
    if (has(id)) return;
    if (id.startsWith("parent:") && family.parent) {
      addN({
        id: `parent:${family.parent.slug}`,
        label: family.parent.name,
        kind: "parent",
        url: family.parent.url,
      });
      return;
    }
    const brand = parseBrandId(id);
    if (brand) {
      addBrand(brand);
      return;
    }
    const hub = parseHubId(id);
    if (hub) {
      addBrand(hub.brand);
      addHub(hub.brand, hub.product);
    }
  }

  function addPagesForHub(b: BrandId, p: ProductId, cap: number) {
    const parent = hubId(b, p);
    ensureNode(parent);
    crawl.pages
      .filter((page) => page.b === b && page.p === p)
      .slice(0, cap)
      .forEach((page, i) => {
        const id = `page:${b}:${p}:${i}`;
        addN({
          id,
          label: page.path.replace(/\/$/, "").split("/").filter(Boolean).slice(-1)[0] || "/",
          kind: "page",
          brand: b,
          product: p,
          url: pageUrl(page),
        });
        addE({
          id: `has:${id}`,
          source: parent,
          target: id,
          kind: "owns",
          label: "page",
        });
      });
  }

  if (opts.includeParent && family.parent && brands.length) {
    addN({
      id: `parent:${family.parent.slug}`,
      label: family.parent.name,
      kind: "parent",
      url: family.parent.url,
    });
  }

  for (const b of brands) addBrand(b);

  if (opts.includeParent && family.parent) {
    for (const b of brands) {
      addE({
        id: `owns:parent:${b}`,
        source: `parent:${family.parent.slug}`,
        target: `brand:${b}`,
        kind: "owns",
        label: "owns",
      });
    }
  }

  for (const b of brands) {
    const info = meta.get(b);
    const plist = (info?.products?.length ? info.products : opts.org ? [] : PRODUCT_ORDER) as string[];
    for (const p of plist) {
      if (opts.product !== "all" && opts.product !== p) continue;
      if (!(p in PRODUCT_LABEL) && p !== "other") {
        addN({
          id: hubId(b, p),
          label: productLabel(p),
          kind: "product",
          brand: b,
        });
        addE({
          id: `owns:${b}:${p}`,
          source: `brand:${b}`,
          target: hubId(b, p),
          kind: "owns",
          label: "owns",
        });
        continue;
      }
      const pid = p as ProductId;
      if (opts.product !== "all" && opts.product !== pid) continue;
      if (countPages(b, pid) === 0 && !(info?.products ?? []).includes(pid)) continue;
      addHub(b, pid);
    }
  }

  const showL2 = opts.layer === "all" || opts.layer === "L2";
  const TREE = TREE_SUGGESTIONS;
  const issueShown = new Set<string>();

  function ruleVisible(code: string) {
    if (isHiddenUiCode(code)) return false;
    if (opts.ruleCodes && !opts.ruleCodes.includes(code)) return false;
    const rule = RULES.find((r) => r.code === code);
    if (!rule) return false;
    // L1 page issues (S08 loan properties, S07 schema type) are not family edges.
    if (rule.layer === "L1" && opts.layer !== "L1") return false;
    if (rule.layer === "L2" && !showL2) return false;
    return true;
  }

  function familyEdgeAllowed(t: (typeof TREE)[number]) {
    if (opts.layer === "L1") return true;
    const glossary = (id: string) => id.includes(":glossary");
    const twins = t.kind === "conflict" && glossary(t.source) && glossary(t.target);
    return t.kind === "sameAs" || twins;
  }

  function attachIssue(t: (typeof TREE)[number], withCites = false) {
    if (!ruleVisible(t.code)) return;
    if (!familyEdgeAllowed(t)) return;
    ensureNode(t.source);
    ensureNode(t.target);
    const iid = `issue:${t.code}`;
    if (has(iid)) {
      issueShown.add(t.code);
    } else {
      addN({
        id: iid,
        label: t.code,
        kind: "issue",
        issueId: t.code,
        brand:
          t.source.includes("achieve") && t.target.includes("achieve")
            ? "achieve"
            : t.source.includes("fdr") && t.target.includes("fdr")
              ? "fdr"
              : undefined,
      });
      addE({
        id: `iss:${t.code}:from`,
        source: t.source,
        target: iid,
        kind: t.kind,
        issueId: t.code,
      });
      addE({
        id: `iss:${t.code}:to`,
        source: iid,
        target: t.target,
        kind: t.kind,
        issueId: t.code,
        label: edgeTag(t.code),
      });
      issueShown.add(t.code);
    }
    if (!withCites) return;
    const rule = RULES.find((r) => r.code === t.code);
    if (!rule?.urls.length) return;
    rule.urls.slice(0, 4).forEach((url, i) => {
      const pid = `page:cite:${t.code}:${i}`;
      const host = url.includes("achieve.com") ? "achieve" : url.includes("freedomdebtrelief") ? "fdr" : undefined;
      addN({
        id: pid,
        label:
          url.replace(/https?:\/\/(www\.)?/, "").replace(/\/$/, "").split("/").slice(-1)[0] || t.code,
        kind: "page",
        brand: host,
        url,
        issueId: t.code,
      });
      addE({
        id: `cite:${pid}`,
        source: iid,
        target: pid,
        kind: "cites",
        label: "cite",
        issueId: t.code,
      });
    });
  }

  function expandId(id: string) {
    ensureNode(id);
    for (const t of TREE) {
      if (t.source === id || t.target === id) attachIssue(t);
    }
    if (id.startsWith("issue:")) {
      const code = id.slice(6);
      const t = TREE.find((x) => x.code === code);
      if (t) attachIssue(t, true);
      return;
    }
    const hub = parseHubId(id);
    if (hub) {
      addPagesForHub(hub.brand, hub.product, opts.explode ? EXPLODE_CAP : EXPAND_PAGE_CAP);
      return;
    }
    const brand = parseBrandId(id);
    if (brand) {
      const info = meta.get(brand);
      const plist = (info?.products?.length ? info.products : opts.org ? [] : PRODUCT_ORDER) as string[];
      for (const p of plist) {
        if (opts.product !== "all" && opts.product !== p) continue;
        if (p in PRODUCT_LABEL) {
          const pid = p as ProductId;
          if (countPages(brand, pid) === 0 && !(info?.products ?? []).includes(pid)) continue;
          ensureNode(hubId(brand, pid));
        } else {
          ensureNode(hubId(brand, p));
        }
      }
    }
  }

  for (const id of opts.expandIds ?? []) expandId(id);

  if (opts.explode) {
    for (const n of [...nodes]) {
      if ((n.kind === "product" || n.kind === "glossary") && n.brand && n.product) {
        addPagesForHub(n.brand, n.product, EXPLODE_CAP);
      }
    }
  }

  for (const t of TREE) {
    if (issueShown.has(t.code)) continue;
    if (!ruleVisible(t.code)) continue;
    if (!has(t.source) || !has(t.target)) continue;
    if (!familyEdgeAllowed(t)) continue;
    addE({
      id: `sug:${t.code}:${t.source}:${t.target}`,
      source: t.source,
      target: t.target,
      kind: t.kind,
      label: edgeTag(t.code),
      issueId: t.code,
    });
  }

  return { nodes, edges };
}
