import raw from "./crawl.json";
import type { CrawlSnapshot } from "@/lib/graph/types";
import { BRAND_HOST, type BrandId, type CrawlPage } from "@/lib/graph/types";

export const crawl = raw as CrawlSnapshot;

export function pageUrl(page: CrawlPage): string {
  const host = BRAND_HOST[page.b as BrandId];
  return `${host}${page.path.startsWith("/") ? page.path : `/${page.path}`}`;
}

export function pagesFor(brand?: BrandId, product?: string): CrawlPage[] {
  return crawl.pages.filter((p) => {
    if (brand && p.b !== brand) return false;
    if (product && product !== "all" && p.p !== product) return false;
    return true;
  });
}
