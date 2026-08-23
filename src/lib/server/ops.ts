import { createServerFn } from "@tanstack/react-start";

function locs(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/g)].map((m) => m[1]!.trim());
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "user-agent": "OriginStudio/1.0 (+content-graph)" },
  });
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  return res.text();
}

export const recrawl = createServerFn({ method: "POST" }).handler(async () => {
  const fdrIndex = await fetchText("https://www.freedomdebtrelief.com/sitemap-index.xml");
  const fdrMaps = locs(fdrIndex);
  const achIndex = await fetchText("https://www.achieve.com/sitemap.xml");
  const achMaps = locs(achIndex);
  const fdr = new Set<string>();
  const achieve = new Set<string>();
  for (const map of fdrMaps) {
    const xml = await fetchText(map);
    for (const u of locs(xml)) {
      if (!u.endsWith(".xml")) fdr.add(u.split("#")[0]!);
    }
  }
  for (const map of achMaps) {
    const xml = await fetchText(map);
    for (const u of locs(xml)) achieve.add(u.split("#")[0]!);
  }
  return {
    crawledAt: new Date().toISOString(),
    counts: { fdr: fdr.size, achieve: achieve.size },
  };
});

export const runPsi = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    if (typeof data !== "string" || !data.startsWith("http")) {
      throw new Error("url required");
    }
    return data;
  })
  .handler(async ({ data: url }) => {
    const endpoint = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=mobile&category=performance`;
    const res = await fetch(endpoint);
    if (!res.ok) {
      return { ok: false as const, status: res.status };
    }
    const json = (await res.json()) as {
      lighthouseResult?: { categories?: { performance?: { score?: number } } };
    };
    const score = Math.round((json.lighthouseResult?.categories?.performance?.score ?? 0) * 100);
    return { ok: true as const, performance: score };
  });
