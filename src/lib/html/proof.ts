export type PageProof = {
  url: string;
  status: number;
  title: string;
  h1: string;
  canonical: string;
  selfCanonical: boolean;
  description: string;
  ogTitle?: string;
  robots?: string;
  definedTermName: string;
  definedTermId: string;
  hasJsonLd: boolean;
};

export type PairProof = {
  slug: string;
  fdr: PageProof;
  achieve: PageProof;
  conflict: string;
};

function textOf(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/&/g, "&").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

function attr(html: string, tagRe: RegExp, attrName: string): string {
  const tag = html.match(tagRe)?.[0] ?? "";
  const m = tag.match(new RegExp(`${attrName}=["']([^"']+)`, "i"));
  return m?.[1]?.trim() ?? "";
}

function sameUrl(a: string, b: string): boolean {
  const n = (u: string) => u.replace(/\/+$/, "").replace(/^https?:\/\//i, "").toLowerCase();
  return n(a) === n(b);
}

export function extractPageProof(html: string, url: string, status = 200): PageProof {
  const title = textOf(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
  const h1 = textOf(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "");
  const canonical =
    attr(html, /<link[^>]+rel=["']canonical["'][^>]*>/i, "href") ||
    attr(html, /<link[^>]+href=["'][^"']+["'][^>]*rel=["']canonical["'][^>]*>/i, "href");
  const description =
    attr(html, /<meta[^>]+name=["']description["'][^>]*>/i, "content") ||
    attr(html, /<meta[^>]+content=["'][^"']+["'][^>]*name=["']description["'][^>]*>/i, "content");
  const ogTitle =
    attr(html, /<meta[^>]+property=["']og:title["'][^>]*>/i, "content") ||
    attr(html, /<meta[^>]+content=["'][^"']+["'][^>]*property=["']og:title["'][^>]*>/i, "content");
  const robots =
    attr(html, /<meta[^>]+name=["']robots["'][^>]*>/i, "content") ||
    attr(html, /<meta[^>]+content=["'][^"']+["'][^>]*name=["']robots["'][^>]*>/i, "content");
  let definedTermName = "";
  let definedTermId = "";
  let hasJsonLd = /application\/ld\+json/i.test(html);
  const block = html.match(/<script[^>]*ld\+json[^>]*>([\s\S]*?)<\/script>/gi) ?? [];
  for (const raw of block) {
    const body = raw.replace(/^[\s\S]*?>/, "").replace(/<\/script>$/i, "");
    if (!/DefinedTerm/i.test(body)) continue;
    definedTermName = body.match(/"name"\s*:\s*"([^"]+)"/)?.[1] ?? "";
    definedTermId = body.match(/"@id"\s*:\s*"([^"]+)"/)?.[1] ?? "";
    break;
  }
  return {
    url,
    status,
    title,
    h1,
    canonical,
    selfCanonical: Boolean(canonical) && sameUrl(canonical, url),
    description,
    ogTitle,
    robots,
    definedTermName,
    definedTermId,
    hasJsonLd,
  };
}

export function pairConflict(slug: string, fdr: PageProof, achieve: PageProof): string {
  const sameH1 = fdr.h1 && achieve.h1 && fdr.h1.toLowerCase() === achieve.h1.toLowerCase();
  const bothSelf = fdr.selfCanonical && achieve.selfCanonical;
  const sameDesc = fdr.description && fdr.description === achieve.description;
  const parts: string[] = [];
  if (fdr.status === 200 && achieve.status === 200) parts.push("Both URLs return 200.");
  if (sameH1) parts.push(`Identical H1: “${fdr.h1}”.`);
  if (bothSelf) {
    parts.push(
      "Each rel=canonical points at itself — that looks valid on one page and is the duplicate. Neither yields the slug to the other brand.",
    );
  }
  if (sameDesc) parts.push("Meta description is the same sentence on both origins.");
  if (fdr.hasJsonLd && !achieve.hasJsonLd) parts.push("FDR emits DefinedTerm JSON-LD; Achieve has none.");
  if (!parts.length) parts.push("Same glossary slug is indexed on both origins.");
  return `${slug}: ${parts.join(" ")}`;
}

/** Captured 2026-08-26 from live HTML. Canonicals look “fine” because they are self-pointers. */
export const S01_PROOF_SEED: PairProof[] = [
  {
    slug: "debt-relief",
    fdr: {
      url: "https://www.freedomdebtrelief.com/glossary/d/debt-relief/",
      status: 200,
      title: "Debt Relief Meaning & Definition | Freedom Debt Relief",
      h1: "Debt Relief Meaning & Definition",
      canonical: "https://www.freedomdebtrelief.com/glossary/d/debt-relief/",
      selfCanonical: true,
      description:
        "Debt relief: what it means, why it matters, and how understanding it can help you manage debt and achieve financial freedom.",
      ogTitle: "Debt Relief Meaning & Definition",
      definedTermName: "Debt Relief",
      definedTermId:
        "https://data.freedomdebtrelief.com/freedomdebtrelief-com/web-pages/debt-relief-c4efdbf287255dba26c2a76707825f00cfd932256851c9ff35ec7233bfb311cf",
      hasJsonLd: true,
    },
    achieve: {
      url: "https://www.achieve.com/glossary/d/debt-relief",
      status: 200,
      title: "Debt Relief Meaning & Definition | Achieve",
      h1: "Debt Relief Meaning & Definition",
      canonical: "https://www.achieve.com/glossary/d/debt-relief",
      selfCanonical: true,
      description:
        "Debt relief: what it means, why it matters, and how understanding it can help you manage debt and achieve financial freedom.",
      definedTermName: "",
      definedTermId: "",
      hasJsonLd: false,
    },
    conflict: "",
  },
  {
    slug: "bankruptcy",
    fdr: {
      url: "https://www.freedomdebtrelief.com/glossary/b/bankruptcy/",
      status: 200,
      title: "Bankruptcy Meaning & Definition | Freedom Debt Relief",
      h1: "Bankruptcy Meaning & Definition",
      canonical: "https://www.freedomdebtrelief.com/glossary/b/bankruptcy/",
      selfCanonical: true,
      description:
        "Bankruptcy: what it means, why it matters, and how understanding it can help you manage debt and achieve financial freedom.",
      ogTitle: "Bankruptcy Meaning & Definition",
      definedTermName: "Bankruptcy",
      definedTermId: "",
      hasJsonLd: true,
    },
    achieve: {
      url: "https://www.achieve.com/glossary/b/bankruptcy",
      status: 200,
      title: "Bankruptcy Meaning & Definition | Achieve",
      h1: "Bankruptcy Meaning & Definition",
      canonical: "https://www.achieve.com/glossary/b/bankruptcy",
      selfCanonical: true,
      description:
        "Bankruptcy: what it means, why it matters, and how understanding it can help you manage debt and achieve financial freedom.",
      definedTermName: "",
      definedTermId: "",
      hasJsonLd: false,
    },
    conflict: "",
  },
  {
    slug: "annual-percentage-rate",
    fdr: {
      url: "https://www.freedomdebtrelief.com/glossary/a/annual-percentage-rate/",
      status: 200,
      title: "Annual Percentage Rate (APR) Definition & Meaning | Freedom Debt Relief",
      h1: "Annual Percentage Rate (APR) Definition & Meaning",
      canonical: "https://www.freedomdebtrelief.com/glossary/a/annual-percentage-rate/",
      selfCanonical: true,
      description: "",
      definedTermName: "",
      definedTermId: "",
      hasJsonLd: true,
    },
    achieve: {
      url: "https://www.achieve.com/glossary/a/annual-percentage-rate",
      status: 200,
      title: "Annual Percentage Rate (APR) Definition & Meaning | Achieve",
      h1: "Annual Percentage Rate (APR) Definition & Meaning",
      canonical: "https://www.achieve.com/glossary/a/annual-percentage-rate",
      selfCanonical: true,
      description: "",
      definedTermName: "",
      definedTermId: "",
      hasJsonLd: false,
    },
    conflict: "",
  },
].map((p) => ({ ...p, conflict: pairConflict(p.slug, p.fdr, p.achieve) }));
