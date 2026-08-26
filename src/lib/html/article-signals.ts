import type { HtmlFinding } from "./semantic.ts";

const ARTICLE_TYPES = ["Article", "NewsArticle", "BlogPosting"];
const REQUIRED = ["headline", "author", "datePublished", "image"] as const;
function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function shortType(t: string): string {
  return t.replace(/^https?:\/\/schema\.org\/?/i, "").replace(/^schema:/i, "");
}

type ArtNode = { types: string[]; name: string; raw: Record<string, unknown> };

function walk(value: unknown, into: ArtNode[]): void {
  if (!value) return;
  if (Array.isArray(value)) {
    for (const item of value) walk(item, into);
    return;
  }
  if (typeof value !== "object") return;
  const rec = value as Record<string, unknown>;
  if (rec["@graph"]) {
    walk(rec["@graph"], into);
    return;
  }
  const types = asArray(rec["@type"] as string | string[] | undefined).map((t) => shortType(String(t)));
  if (types.some((t) => ARTICLE_TYPES.includes(t))) {
    into.push({ types, name: String(rec.name ?? rec.headline ?? ""), raw: rec });
  }
}

function articleNodes(html: string): ArtNode[] {
  const into: ArtNode[] = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      walk(JSON.parse((m[1] ?? "").trim()) as unknown, into);
    } catch {
      /* skip broken blocks — S21 owns parse errors */
    }
  }
  return into;
}

function decode(s: string): string {
  return s
    .replace(/&/g, "&")
    .replace(/&#x27;|'/gi, "'")
    .replace(/"/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function attr(html: string, tagRe: RegExp, name: string): string {
  const tag = html.match(tagRe)?.[0] ?? "";
  const m = tag.match(new RegExp(`${name}=["']([^"']+)`, "i"));
  return decode(m?.[1] ?? "");
}

function first(html: string, re: RegExp): string {
  const m = html.match(re);
  return decode(m?.[1] ?? "");
}

function tokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/\|[^|]*$/, "")
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 1),
  );
}

function jaccard(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.size || !tb.size) return 1;
  let inter = 0;
  ta.forEach((t) => {
    if (tb.has(t)) inter += 1;
  });
  return inter / (ta.size + tb.size - inter);
}

function titlesClash(a: string, b: string): boolean {
  if (!a || !b) return false;
  return jaccard(a, b) < 0.72;
}

function authorName(raw: unknown): string {
  if (!raw) return "";
  if (typeof raw === "string") return raw.trim();
  if (Array.isArray(raw)) return authorName(raw[0]);
  if (typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    return String(o.name ?? o["@id"] ?? "").trim();
  }
  return "";
}

function daysBetween(a: string, b: string): number | null {
  const da = Date.parse(a);
  const db = Date.parse(b);
  if (Number.isNaN(da) || Number.isNaN(db)) return null;
  return Math.abs(da - db) / 86_400_000;
}

function pathOf(url: string): string {
  try {
    return new URL(url).pathname.replace(/\/+$/, "").toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

export function analyzeArticleSignals(html: string, url: string): HtmlFinding[] {
  const title = first(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const h1 = first(html, /<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  const ogTitle =
    attr(html, /<meta[^>]+property=["']og:title["'][^>]*>/i, "content") ||
    attr(html, /<meta[^>]+content=["'][^"']+["'][^>]*property=["']og:title["'][^>]*>/i, "content");
  const visibleAuthor =
    first(html, /rel=["']author["'][^>]*>([\s\S]*?)</i) ||
    first(html, /itemprop=["']author["'][^>]*>([\s\S]*?)</i) ||
    first(html, /class=["'][^"']*author[^"']*["'][^>]*>([\s\S]*?)</i);
  const visibleDate =
    attr(html, /<time[^>]*>/i, "datetime") ||
    first(html, /datetime=["']([^"']+)/i) ||
    first(html, /itemprop=["']datePublished["'][^>]*>([\s\S]*?)</i);

  const articles = articleNodes(html);
  if (!articles.length && !/\/learn\/|\/blog\/|\/newsroom\/|\/insights\//i.test(url)) return [];

  const brand: HtmlFinding["lane"] = url.includes("achieve.com") ? "achieve" : "fdr";
  const out: HtmlFinding[] = [];
  const art = articles[0];
  const headline = art ? String(art.raw.headline ?? art.name ?? "") : "";
  const schemaAuthor = art ? authorName(art.raw.author) : "";
  const published = art ? String(art.raw.datePublished ?? "") : "";
  const modified = art ? String(art.raw.dateModified ?? "") : "";

  if (art) {
    const missing = REQUIRED.filter((k) => {
      if (k === "headline") return !headline;
      if (k === "author") return !schemaAuthor;
      if (k === "datePublished") return !published;
      if (k === "image") return art.raw.image == null;
      return false;
    });
    if (missing.length) {
      out.push({
        id: `S27:${url}`,
        code: "S27",
        title: "Article schema is incomplete",
        lane: brand,
        url,
        why: `Article/NewsArticle needs headline, author, datePublished, and image. Missing ${missing.join(", ")}. Google will not attach the story to a person or a date.`,
        found: JSON.stringify(
          { type: art.types, headline, author: schemaAuthor, datePublished: published || "(none)", dateModified: modified || "(none)" },
          null,
          2,
        ),
        suggested: JSON.stringify(
          {
            "@type": art.types[0] ?? "Article",
            headline: headline || h1 || title,
            author: { "@type": "Person", name: schemaAuthor || visibleAuthor || "Editor" },
            datePublished: published || "YYYY-MM-DD",
            dateModified: modified || published || "YYYY-MM-DD",
            image: "https://…",
            mainEntityOfPage: url,
          },
          null,
          2,
        ),
      });
    }
  } else if (/\/learn\/|\/blog\/|\/newsroom\/|\/insights\//i.test(url)) {
    out.push({
      id: `S27:${url}`,
      code: "S27",
      title: "Article URL has no Article schema",
      lane: brand,
      url,
      why: "Learn/news URLs must emit Article or NewsArticle. Without it the story has no headline, author, or date in the graph.",
      found: "(no Article / NewsArticle / BlogPosting node)",
      suggested: JSON.stringify({ "@type": "Article", headline: h1 || title, mainEntityOfPage: url }, null, 2),
    });
  }

  const titlePairs: Array<[string, string, string, string]> = [
    ["title", title, "H1", h1],
    ["title", title, "headline", headline],
    ["H1", h1, "headline", headline],
    ["title", title, "og:title", ogTitle],
    ["H1", h1, "og:title", ogTitle],
  ];
  const clashes = titlePairs.filter(([, a, , b]) => titlesClash(a, b));
  if (clashes.length) {
    const lines = clashes.map(([la, a, lb, b]) => `${la}: ${a}\n${lb}: ${b}  (jaccard ${(jaccard(a, b) * 100).toFixed(0)}%)`);
    out.push({
      id: `S28:${url}`,
      code: "S28",
      title: "Title signals conflict",
      lane: brand,
      url,
      why: "Document title, H1, og:title, and schema headline must name the same story. A question-H1 with a keyword-title splits ranking and featured snippets.",
      found: lines.join("\n\n"),
      suggested: `One title string everywhere:\n<title>${h1 || headline || title}</title>\n<h1>${h1 || headline || title}</h1>\nheadline: ${h1 || headline || title}`,
    });
  }

  if (schemaAuthor && visibleAuthor && jaccard(schemaAuthor, visibleAuthor) < 0.5) {
    out.push({
      id: `S29:${url}`,
      code: "S29",
      title: "Author signals conflict",
      lane: brand,
      url,
      why: "The byline person is not the schema author. Search attaches E-E-A-T to the wrong Person node.",
      found: `visible: ${visibleAuthor}\nschema: ${schemaAuthor}`,
      suggested: `author: { "@type": "Person", "name": "${visibleAuthor}" }`,
    });
  }
  if (art && !art.types.includes("NewsArticle") && schemaAuthor && /organization|freedomdebtrelief|achieve\.com/i.test(schemaAuthor) && !/person/i.test(String(art.raw.author))) {
    out.push({
      id: `S29:${url}`,
      code: "S29",
      title: "Article author is the Organization, not a Person",
      lane: brand,
      url,
      why: "Opinion/learn Articles need a Person author. Org-as-author is for NewsArticle press releases only.",
      found: `author: ${schemaAuthor}`,
      suggested: `author: { "@type": "Person", "name": "…", "url": "${brand === "fdr" ? "https://www.freedomdebtrelief.com/author/" : "https://www.achieve.com/authors/"}" }`,
    });
  }

  if (published && modified) {
    const days = daysBetween(published, modified);
    if (days != null && days > 180) {
      out.push({
        id: `S30:${url}`,
        code: "S30",
        title: "Published and modified dates conflict",
        lane: brand,
        url,
        why: `datePublished ${published.slice(0, 10)} and dateModified ${modified.slice(0, 10)} are ${Math.round(days)} days apart. Freshness and original-publish signals fight. Visible date is ${visibleDate || "missing"}.`,
        found: `datePublished: ${published}\ndateModified: ${modified}\nvisible: ${visibleDate || "(none)"}`,
        suggested: "Keep datePublished as first ship. dateModified only when the story actually changed. Surface both in the byline.",
      });
    }
  }

  if (art) {
    const images = Array.isArray(art.raw.image) ? art.raw.image : art.raw.image ? [art.raw.image] : [];
    const pagePath = pathOf(url);
    for (const img of images) {
      const rec: Record<string, unknown> = typeof img === "object" && img ? (img as Record<string, unknown>) : { url: img };
      const id = String(rec["@id"] ?? rec.url ?? "");
      const imgPath = pathOf(id.split("#")[0] ?? id);
      if (imgPath && pagePath && imgPath !== pagePath && /(^|\/)(debt-relief|heloc|home-equity|personal-loans)(\/|$)/.test(imgPath)) {
        out.push({
          id: `S31:${url}`,
          code: "S31",
          title: "Article image is bound to a different URL",
          lane: brand,
          url,
          why: "The Article image @id points at another page (product or a different story). That steals the image entity and mixes content graphs.",
          found: `@id ${id}`,
          suggested: `{ "@type": "ImageObject", "@id": "${url}#primaryimage", "url": "https://…article-hero" }`,
        });
        break;
      }
    }
  }

  return out;
}
