import { ISSUE_PROOFS } from "@/data/issue-proofs";
import { RULES } from "@/data/rules-seed";
import { S01_PROOF_SEED, type PageProof } from "@/lib/html/proof";
import { liveGate, samePage } from "@/lib/studio/issue-detail";

export type PageMetaView = {
  url: string;
  canonical: string;
  selfCanonical: boolean;
  title: string;
  h1: string;
  ogTitle: string;
  description: string;
  missing: string[];
  clashes: string[];
  familyConflict: string;
  robots: string;
  nosnippet: boolean;
  hrefCount: number | null;
};

function norm(s: string): string {
  return s.toLowerCase().replace(/\|[^|]*$/, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function agree(a: string, b: string): boolean {
  if (!a || !b) return true;
  return norm(a) === norm(b) || norm(a).includes(norm(b)) || norm(b).includes(norm(a));
}

/** Live snapshot fields for pages the inspector actually opens. Hide a field when blank. */
const PAGE_IDENTITY: Array<{
  url: string;
  canonical?: string;
  title?: string;
  h1?: string;
  ogTitle?: string;
  description?: string;
  robots?: string;
}> = [
  {
    url: "https://www.freedomdebtrelief.com/debt-relief/",
    canonical: "https://www.freedomdebtrelief.com/debt-relief/",
    title: "What is debt relief? An Overview",
    h1: "What is Debt Relief?",
    ogTitle: "What is debt relief? An Overview | Freedom Debt Relief",
    description:
      "Debt relief is when a creditor forgives or cancels the money you owe. Freedom Debt Relief is the leading debt relief company that helps you negotiate and settle your debt.",
    robots: "index,follow",
  },
];

function identityFor(url: string) {
  return PAGE_IDENTITY.find((p) => samePage(p.url, url));
}

function withIdentity(v: PageMetaView): PageMetaView {
  const hit = identityFor(v.url);
  if (!hit) return v;
  return finish({
    ...v,
    canonical: v.canonical || hit.canonical || "",
    title: v.title || hit.title || "",
    h1: v.h1 || hit.h1 || "",
    ogTitle: v.ogTitle || hit.ogTitle || "",
    description: v.description || hit.description || "",
    robots: v.robots || hit.robots || "",
  });
}

export function blockingIssuesForUrl(url: string): Array<{ code: string; title: string }> {
  return RULES.filter((i) => {
    if (i.status && i.status !== "open") return false;
    if (!liveGate(i.impact, i.acceptance?.originPass).blocks) return false;
    return (i.urls ?? []).some((u) => samePage(u, url));
  }).map((i) => ({ code: i.code, title: i.title }));
}

function urlHasBlockingIssue(url: string): boolean {
  return blockingIssuesForUrl(url).length > 0;
}

function fromProof(p: PageProof): PageMetaView {
  return finish({
    url: p.url,
    canonical: p.canonical,
    selfCanonical: p.selfCanonical,
    title: p.title,
    h1: p.h1,
    ogTitle: p.ogTitle ?? "",
    description: p.description,
    missing: [],
    clashes: [],
    familyConflict: "",
    robots: p.robots ?? "",
    nosnippet: false,
    hrefCount: null,
  });
}

function finish(v: PageMetaView): PageMetaView {
  const missing: string[] = [];
  if (!v.canonical) missing.push("rel=canonical");
  if (!v.title) missing.push("title");
  if (!v.h1) missing.push("H1");
  if (!v.ogTitle) missing.push("og:title");
  if (!v.description) missing.push("meta description");
  const clashes: string[] = [];
  if (v.title && v.h1 && !agree(v.title, v.h1)) clashes.push("title ≠ H1");
  if (v.title && v.ogTitle && !agree(v.title, v.ogTitle)) clashes.push("title ≠ og:title");
  if (v.h1 && v.ogTitle && !agree(v.h1, v.ogTitle)) clashes.push("H1 ≠ og:title");
  const family = S01_PROOF_SEED.find(
    (pair) => samePage(pair.fdr.url, v.url) || samePage(pair.achieve.url, v.url),
  );
  let familyConflict = "";
  if (family && family.fdr.selfCanonical && family.achieve.selfCanonical) {
    familyConflict = family.conflict;
  }
  return { ...v, missing, clashes, familyConflict };
}

export function pageMetaForUrl(url: string): PageMetaView | null {
  if (!url.trim()) return null;
  for (const pair of S01_PROOF_SEED) {
    if (samePage(pair.fdr.url, url)) return withIdentity(fromProof(pair.fdr));
    if (samePage(pair.achieve.url, url)) return withIdentity(fromProof(pair.achieve));
  }
  for (const proof of Object.values(ISSUE_PROOFS)) {
    const row = proof.rows.find((r) => samePage(r.url, url));
    if (!row) continue;
    const extra = row.extra ?? "";
    const title = extra.match(/title:\s*([^·]+)/i)?.[1]?.trim() ?? "";
    const ogTitle = extra.match(/og:title:\s*([^·]+)/i)?.[1]?.trim() ?? "";
    const description = extra.match(/meta description[^·]*·?\s*(.+)$/i)?.[1]?.trim() ?? "";
    return withIdentity(
      finish({
        url: row.url,
        canonical: row.canonical,
        selfCanonical: Boolean(row.canonical) && samePage(row.canonical, row.url),
        title,
        h1: row.h1,
        ogTitle,
        description: /identical|same sentence/i.test(extra) ? extra : description,
        missing: [],
        clashes: [],
        familyConflict: proof.conflict,
        robots: "",
        nosnippet: false,
        hrefCount: null,
      }),
    );
  }
  const only = identityFor(url);
  if (only) {
    return withIdentity(
      finish({
        url: only.url,
        canonical: only.canonical || "",
        selfCanonical: Boolean(only.canonical) && samePage(only.canonical, only.url),
        title: only.title || "",
        h1: only.h1 || "",
        ogTitle: only.ogTitle || "",
        description: only.description || "",
        missing: [],
        clashes: [],
        familyConflict: "",
        robots: only.robots || "",
        nosnippet: false,
        hrefCount: null,
      }),
    );
  }
  return null;
}

export function pageMetaBlocksLive(meta: PageMetaView): boolean {
  return (
    urlHasBlockingIssue(meta.url) ||
    meta.clashes.length > 0 ||
    meta.missing.includes("rel=canonical") ||
    meta.nosnippet
  );
}
