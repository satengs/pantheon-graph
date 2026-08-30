export type PageFacts = {
  url: string;
  title: string;
  h1: string;
  canonical: string;
  ogTitle: string;
  jsonLdTypes: string[];
  jsonLd: string;
  text: string;
  hasNmls: boolean;
  nmlsIds: string[];
};

function attr(html: string, tag: string, name: string): string {
  const re = new RegExp(`<${tag}[^>]*${name}=["']([^"']+)["'][^>]*>`, "i");
  return re.exec(html)?.[1]?.trim() ?? "";
}

export function extractPageFacts(html: string, url: string): PageFacts {
  const title = /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1]?.trim() ?? "";
  const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1]?.replace(/<[^>]+>/g, "").trim() ?? "";
  const canonical = attr(html, "link", "href") && /rel=["']canonical["']/i.test(html)
    ? (/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i.exec(html)?.[1] ??
        /<link[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical["']/i.exec(html)?.[1] ??
        "")
    : "";
  const ogTitle = /property=["']og:title["'][^>]*content=["']([^"']+)["']/i.exec(html)?.[1]
    ?? /content=["']([^"']+)["'][^>]*property=["']og:title["']/i.exec(html)?.[1]
    ?? "";
  const blocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1] ?? "");
  const jsonLd = blocks.join("\n").slice(0, 8000);
  const jsonLdTypes = [...jsonLd.matchAll(/"@type"\s*:\s*"([^"]+)"/g)].map((m) => m[1]!);
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 6000);
  const nmlsIds = [...text.matchAll(/\bNMLS(?:\s*ID)?\s*#?\s*(\d{4,})/gi)].map((m) => m[1]!);
  return {
    url,
    title,
    h1,
    canonical,
    ogTitle,
    jsonLdTypes: [...new Set(jsonLdTypes)],
    jsonLd,
    text,
    hasNmls: nmlsIds.length > 0 || /NMLS/i.test(text),
    nmlsIds,
  };
}
