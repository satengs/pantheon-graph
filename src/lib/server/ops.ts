import { createServerFn } from "@tanstack/react-start";

const FETCH_HEADERS = { "user-agent": "OriginStudio/1.0 (+content-graph)" };
const MAP_CONCURRENCY = 8;

function locs(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/g)].map((m) => m[1]!.trim());
}

async function fetchText(url: string, timeoutMs = 12_000): Promise<string> {
  const res = await fetch(url, {
    headers: FETCH_HEADERS,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  return res.text();
}

async function mapPool<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  if (items.length === 0) return [];
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next;
      next += 1;
      out[i] = await fn(items[i]!);
    }
  }
  const n = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: n }, () => worker()));
  return out;
}

function collectPages(xml: string, into: Set<string>) {
  for (const u of locs(xml)) {
    if (!u.endsWith(".xml")) into.add(u.split("#")[0]!);
  }
}

export const recrawl = createServerFn({ method: "POST" }).handler(async () => {
  const [fdrIndex, achIndex] = await Promise.all([
    fetchText("https://www.freedomdebtrelief.com/sitemap-index.xml"),
    fetchText("https://www.achieve.com/sitemap.xml"),
  ]);
  const fdrMaps = locs(fdrIndex);
  const achMaps = locs(achIndex);
  const fdr = new Set<string>();
  const achieve = new Set<string>();
  const [fdrXmls, achXmls] = await Promise.all([
    mapPool(fdrMaps, MAP_CONCURRENCY, (map) => fetchText(map)),
    mapPool(achMaps, MAP_CONCURRENCY, (map) => fetchText(map)),
  ]);
  for (const xml of fdrXmls) collectPages(xml, fdr);
  for (const xml of achXmls) collectPages(xml, achieve);
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
    const res = await fetch(endpoint, { signal: AbortSignal.timeout(25_000) });
    if (!res.ok) {
      return { ok: false as const, status: res.status };
    }
    const json = (await res.json()) as {
      lighthouseResult?: { categories?: { performance?: { score?: number } } };
    };
    const score = Math.round((json.lighthouseResult?.categories?.performance?.score ?? 0) * 100);
    return { ok: true as const, performance: score };
  });
