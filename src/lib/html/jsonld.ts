import type { BrandId, ProductId } from "@/lib/graph/types";
import type { HtmlFinding } from "@/lib/html/semantic";

export type JsonLdNode = {
  id: string;
  types: string[];
  name: string;
  raw: Record<string, unknown>;
};

export type JsonLdCheck = "exists" | "org" | "type" | "props";

export type JsonLdOptions = {
  brand?: BrandId | "all";
  product?: ProductId | "all";
  orgId?: string;
  checks?: JsonLdCheck[];
};

const COMPETING = [
  "Article",
  "FinancialProduct",
  "LoanOrCredit",
  "Service",
  "DefinedTerm",
  "FAQPage",
  "Product",
];

const EXPECTED: Record<string, string[]> = {
  glossary: ["DefinedTerm"],
  heloc: ["LoanOrCredit", "FinancialProduct"],
  hel: ["LoanOrCredit", "FinancialProduct"],
  "personal-loan": ["LoanOrCredit"],
  "debt-relief": ["Service"],
  settlement: ["Service"],
  consolidation: ["LoanOrCredit", "Service"],
  other: ["Organization", "WebPage"],
};

const LOAN_PROPS = ["interestRate", "annualPercentageRate", "loanTerm", "amount"];

const DEFAULT_ORG: Record<BrandId, string> = {
  fdr: "https://www.freedomdebtrelief.com/#organization",
  achieve: "https://www.achieve.com/#organization",
};

function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function shortType(t: string): string {
  return t.replace(/^https?:\/\/schema\.org\/?/i, "").replace(/^schema:/i, "");
}

function brandFromUrl(url: string): BrandId | undefined {
  if (url.includes("achieve.com")) return "achieve";
  if (url.includes("freedomdebtrelief")) return "fdr";
  return undefined;
}

export function productFromUrl(url: string): ProductId {
  const p = url.toLowerCase();
  if (p.includes("/glossary")) return "glossary";
  if (p.includes("heloc")) return "heloc";
  if (p.includes("home-equity") || /\/hel(\/|$)/.test(p)) return "hel";
  if (p.includes("personal-loan") || p.includes("personal_loan")) return "personal-loan";
  if (p.includes("settlement")) return "settlement";
  if (p.includes("consolidat")) return "consolidation";
  if (p.includes("debt-relief") || p.includes("debtrelief")) return "debt-relief";
  return "other";
}

function topNodes(value: unknown, into: JsonLdNode[]): void {
  if (!value) return;
  if (Array.isArray(value)) {
    for (const item of value) topNodes(item, into);
    return;
  }
  if (typeof value !== "object") return;
  const rec = value as Record<string, unknown>;
  if (rec["@graph"]) {
    topNodes(rec["@graph"], into);
    return;
  }
  const types = asArray(rec["@type"] as string | string[] | undefined).map((t) =>
    shortType(String(t)),
  );
  if (!types.length) return;
  into.push({
    id: String(rec["@id"] ?? rec.id ?? ""),
    types,
    name: String(rec.name ?? rec.headline ?? ""),
    raw: rec,
  });
}

export function extractJsonLd(html: string): { nodes: JsonLdNode[]; scripts: string[]; errors: string[] } {
  const scripts: string[] = [];
  const errors: string[] = [];
  const nodes: JsonLdNode[] = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const raw = (m[1] ?? "").trim();
    if (!raw) continue;
    scripts.push(raw);
    try {
      topNodes(JSON.parse(raw) as unknown, nodes);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : "Invalid JSON-LD");
    }
  }
  return { nodes, scripts, errors };
}

function pretty(nodes: JsonLdNode[]): string {
  if (!nodes.length) return "(no JSON-LD)";
  return nodes
    .map((n) => {
      const id = n.id ? ` @id=${n.id}` : "";
      return `<${n.types.join("|")}${id}> ${n.name}`.trim();
    })
    .join("\n");
}

function suggestedGraph(opts: {
  url: string;
  orgId: string;
  primary: string;
  name: string;
}): string {
  return JSON.stringify(
    {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "Organization",
          "@id": opts.orgId,
          name: opts.orgId.includes("achieve") ? "Achieve" : "Freedom Debt Relief",
        },
        {
          "@type": opts.primary,
          "@id": opts.url,
          name: opts.name,
          mainEntityOfPage: opts.url,
          provider: { "@id": opts.orgId },
        },
      ],
    },
    null,
    2,
  );
}

export function analyzeJsonLd(html: string, url: string, opts: JsonLdOptions = {}): HtmlFinding[] {
  const checks = opts.checks ?? ["exists", "org", "type", "props"];
  const brand = (opts.brand && opts.brand !== "all" ? opts.brand : brandFromUrl(url)) ?? "fdr";
  const product = opts.product && opts.product !== "all" ? opts.product : productFromUrl(url);
  const orgId = opts.orgId || DEFAULT_ORG[brand];
  const { nodes, scripts, errors } = extractJsonLd(html);
  const findings: HtmlFinding[] = [];
  const lane: HtmlFinding["lane"] = brand === "achieve" ? "achieve" : brand === "fdr" ? "fdr" : "issue";
  const foundText = scripts.length ? scripts.join("\n---\n") : pretty(nodes);

  if (checks.includes("exists") && scripts.length === 0) {
    findings.push({
      id: `S21:${url}:exists`,
      code: "S21",
      title: "JSON-LD is missing",
      lane,
      url,
      why: "Search and entity graphs need a JSON-LD block. Without it the URL has no typed node, so brand and product cannot own the page.",
      found: "(no application/ld+json)",
      suggested: suggestedGraph({ url, orgId, primary: EXPECTED[product]?.[0] ?? "WebPage", name: url }),
    });
    return findings;
  }

  if (errors.length) {
    findings.push({
      id: `S21:${url}:parse`,
      code: "S21",
      title: "JSON-LD does not parse",
      lane,
      url,
      why: "Broken JSON-LD is the same as missing schema. Validators drop the graph.",
      found: errors.join("\n"),
      suggested: suggestedGraph({ url, orgId, primary: EXPECTED[product]?.[0] ?? "WebPage", name: url }),
    });
  }

  const orgs = nodes.filter((n) => n.types.includes("Organization"));
  if (checks.includes("org")) {
    const match = orgs.find((n) => normalizeId(n.id) === normalizeId(orgId));
    if (!match) {
      findings.push({
        id: `S05:${url}:org`,
        code: brand === "achieve" ? "S05" : "S21",
        title: "Organization @id does not match the brand pin",
        lane,
        url,
        why: `The org node must stay ${orgId}. A missing, relative, or rotating @id mints duplicate organizations and steals the other brand's graph.`,
        found: pretty(orgs.length ? orgs : nodes),
        suggested: `{ "@type": "Organization", "@id": "${orgId}" }`,
      });
    }
  }

  const topTypes = new Set(nodes.flatMap((n) => n.types));
  const competing = COMPETING.filter((t) => topTypes.has(t));
  if (checks.includes("type") && competing.length > 1) {
    findings.push({
      id: `S07:${url}:type`,
      code: "S07",
      title: "JSON-LD mixes competing @types on one URL",
      lane,
      url,
      why: "FAQPage, Article, Service, and LoanOrCredit cannot sit as siblings for the same URL. One primary type owns the page; FAQ and breadcrumbs nest under it.",
      found: pretty(nodes.filter((n) => n.types.some((t) => COMPETING.includes(t)))),
      suggested: suggestedGraph({
        url,
        orgId,
        primary: EXPECTED[product]?.[0] ?? competing[0]!,
        name: nodes[0]?.name || url,
      }),
    });
  }

  const expected = EXPECTED[product] ?? [];
  const hasExpected = expected.some((t) => topTypes.has(t));
  if (checks.includes("type") && expected.length && scripts.length && !hasExpected) {
    findings.push({
      id: `S21:${url}:mismatch`,
      code: "S21",
      title: `JSON-LD type does not match ${product}`,
      lane,
      url,
      why: `This URL is a ${product} page, so the graph should include ${expected.join(" or ")}. Found ${[...topTypes].join(", ") || "nothing typed"}.`,
      found: foundText.slice(0, 4000),
      suggested: suggestedGraph({ url, orgId, primary: expected[0]!, name: nodes[0]?.name || product }),
    });
  }

  if (checks.includes("props")) {
    const loans = nodes.filter((n) => n.types.includes("LoanOrCredit") || n.types.includes("FinancialProduct"));
    for (const loan of loans) {
      const missing = LOAN_PROPS.filter((k) => loan.raw[k] == null && loan.raw[k.replace(/^[a-z]/, (c) => c)] == null);
      if (missing.length) {
        findings.push({
          id: `S08:${url}:props`,
          code: "S08",
          title: "LoanOrCredit is missing required properties",
          lane: "achieve",
          url,
          why: "Rich results stay thin without interestRate, annualPercentageRate, loanTerm, and amount on the loan node.",
          found: pretty([loan]) + `\nmissing: ${missing.join(", ")}`,
          suggested: JSON.stringify(
            { "@type": "LoanOrCredit", "@id": url, interestRate: 0, annualPercentageRate: 0, loanTerm: "P10Y", amount: 0 },
            null,
            2,
          ),
        });
      }
    }
  }

  return findings;
}

function normalizeId(id: string): string {
  return id.trim().replace(/\/+$/, "").toLowerCase();
}

export const JSONLD_RULE_CODE = "S21";
