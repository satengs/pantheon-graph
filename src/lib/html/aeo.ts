import type { HtmlFinding } from "./semantic.ts";

export type AeoMeta = {
  robots: string;
  googlebot: string;
  noindex: boolean;
  nosnippet: boolean;
  maxSnippetZero: boolean;
  dataNosnippet: boolean;
  canonicals: string[];
  description: string;
  hrefCount: number;
  hrefs: string[];
};

function attr(html: string, tagRe: RegExp, name: string): string {
  const tag = html.match(tagRe)?.[0] ?? "";
  const m = tag.match(new RegExp(`${name}=["']([^"']+)`, "i"));
  return (m?.[1] ?? "").trim();
}

function allAttrs(html: string, tagRe: RegExp, name: string): string[] {
  const out: string[] = [];
  const re = new RegExp(tagRe.source, tagRe.flags.includes("g") ? tagRe.flags : `${tagRe.flags}g`);
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const tag = m[0];
    const a = tag.match(new RegExp(`${name}=["']([^"']+)`, "i"));
    if (a?.[1]) out.push(a[1].trim());
  }
  return out;
}

export function extractAeo(html: string, pageUrl: string): AeoMeta {
  const robots =
    attr(html, /<meta[^>]+name=["']robots["'][^>]*>/i, "content") ||
    attr(html, /<meta[^>]+content=["'][^"']+["'][^>]*name=["']robots["'][^>]*>/i, "content");
  const googlebot =
    attr(html, /<meta[^>]+name=["']googlebot["'][^>]*>/i, "content") ||
    attr(html, /<meta[^>]+content=["'][^"']+["'][^>]*name=["']googlebot["'][^>]*>/i, "content");
  const blob = `${robots} ${googlebot}`.toLowerCase();
  const canonicals = [
    ...allAttrs(html, /<link[^>]*rel=["']canonical["'][^>]*>/gi, "href"),
    ...allAttrs(html, /<link[^>]*href=["'][^"']+["'][^>]*rel=["']canonical["'][^>]*>/gi, "href"),
  ].filter((v, i, a) => a.indexOf(v) === i);
  const description =
    attr(html, /<meta[^>]+name=["']description["'][^>]*>/i, "content") ||
    attr(html, /<meta[^>]+content=["'][^"']+["'][^>]*name=["']description["'][^>]*>/i, "content");
  const hrefs: string[] = [];
  const re = /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const href = (m[1] ?? "").trim();
    if (!href || href.startsWith("javascript:") || href.startsWith("mailto:")) continue;
    try {
      hrefs.push(new URL(href, pageUrl).href);
    } catch {
      /* skip */
    }
  }
  return {
    robots,
    googlebot,
    noindex: /\bnoindex\b/.test(blob),
    nosnippet: /\bnosnippet\b/.test(blob) || /\bdata-nosnippet\b/i.test(html),
    maxSnippetZero: /\bmax-snippet\s*:\s*0\b/.test(blob),
    dataNosnippet: /\bdata-nosnippet\b/i.test(html),
    canonicals,
    description,
    hrefCount: hrefs.length,
    hrefs,
  };
}

function finding(
  code: string,
  title: string,
  url: string,
  why: string,
  found: string,
  suggested: string,
): HtmlFinding {
  return { id: `${code}:${url}`, code, title, lane: "issue", url, why, found, suggested };
}

export function analyzeAeo(html: string, url: string, cloneDescriptions?: string[]): HtmlFinding[] {
  const a = extractAeo(html, url);
  const out: HtmlFinding[] = [];
  if (a.noindex) {
    out.push(
      finding(
        "ROBOTS",
        "robots/googlebot noindex blocks this page",
        url,
        "A noindex (or googlebot noindex) token is a hard live gate. The page will not enter SERP or AI Overviews.",
        a.robots || a.googlebot || "noindex",
        "Remove noindex unless this URL is meant to stay private. Then keep it out of the sitemap.",
      ),
    );
  }
  if (a.nosnippet || a.maxSnippetZero || a.dataNosnippet) {
    out.push(
      finding(
        "NOSNIPPET",
        "nosnippet / max-snippet:0 hides answers from AI Overviews",
        url,
        "nosnippet, max-snippet:0, or data-nosnippet on answers is an AIO hard gate. The page can rank and still not be quoted.",
        [a.robots, a.googlebot, a.dataNosnippet ? "data-nosnippet" : ""].filter(Boolean).join(" · "),
        "Drop nosnippet and max-snippet:0 on the answer block. Keep data-nosnippet only on chrome, never on the claim.",
      ),
    );
  }
  if (!a.canonicals.length) {
    out.push(
      finding(
        "CANON",
        "rel=canonical is missing in the raw HTML",
        url,
        "Without a live canonical, duplicates and cross-brand twins both look indexable.",
        "(no <link rel=canonical>)",
        "Emit one rel=canonical to the owner URL in raw HTML, not only in a tag manager.",
      ),
    );
  } else if (a.canonicals.length > 1) {
    out.push(
      finding(
        "CANON",
        "Multiple rel=canonical tags conflict",
        url,
        "More than one canonical in the raw HTML is undefined for Google. Treat as a live block.",
        a.canonicals.join("\n"),
        "Keep a single rel=canonical. Delete the extras.",
      ),
    );
  }
  if (!a.description.trim()) {
    out.push(
      finding(
        "MDESC",
        "Meta description is empty",
        url,
        "Empty description wastes the SERP snippet and gives AIO no page-level summary.",
        "(empty)",
        "Write a unique description that matches the H1 claim.",
      ),
    );
  } else if (cloneDescriptions?.some((d) => d && d === a.description)) {
    out.push(
      finding(
        "MDESC",
        "Meta description is cloned from another origin",
        url,
        "The same sentence on two brands is a duplicate signal, same class as S01 self-canonicals.",
        a.description,
        "Write a brand-owned description. Do not copy the twin page.",
      ),
    );
  }
  if (a.hrefCount === 0) {
    out.push(
      finding(
        "HREF",
        "No crawlable a[href] on this page",
        url,
        "Zero crawlable links means Googlebot cannot walk onward. The page is a dead end and nearby URLs become orphans.",
        "(no a[href])",
        "Add real a[href] to owner, glossary, and related product URLs. JS-only navigation does not count.",
      ),
    );
  }
  return out;
}

export function orphanPaths(pageUrl: string, hrefs: string[], sitemapUrls: string[]): string[] {
  const linked = new Set(hrefs.map((h) => h.replace(/\/$/, "").toLowerCase()));
  const here = pageUrl.replace(/\/$/, "").toLowerCase();
  return sitemapUrls.filter((u) => {
    const n = u.replace(/\/$/, "").toLowerCase();
    return n !== here && !linked.has(n);
  });
}
