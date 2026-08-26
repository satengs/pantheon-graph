import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import {
  extractPageProof,
  pairConflict,
  S01_PROOF_SEED,
  type PairProof,
} from "@/lib/html/proof";

const FETCH_HEADERS = { "user-agent": "Mozilla/5.0 (compatible; OriginStudio/1.0)" };

async function fetchProof(url: string) {
  const res = await fetch(url, { headers: FETCH_HEADERS, signal: AbortSignal.timeout(12_000), redirect: "follow" });
  const html = (await res.text()).slice(0, 500_000);
  return extractPageProof(html, url, res.status);
}

export const proveOverlap = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ live: z.boolean().optional(), limit: z.number().int().min(1).max(8).optional() }))
  .handler(async ({ data }) => {
    const { crawl } = await import("@/data/crawl");
    if (!data.live) {
      return {
        overlap: crawl.glossaryOverlap.length,
        pairs: S01_PROOF_SEED,
        source: "captured" as const,
      };
    }
    const want = ["debt-relief", "bankruptcy", "annual-percentage-rate"];
    const fromCrawl = crawl.glossaryOverlap.filter((p) => want.includes(p.slug));
    const pairs: PairProof[] = [];
    for (const row of fromCrawl.slice(0, data.limit ?? 3)) {
      try {
        const [fdr, achieve] = await Promise.all([fetchProof(row.fdr), fetchProof(row.achieve)]);
        pairs.push({ slug: row.slug, fdr, achieve, conflict: pairConflict(row.slug, fdr, achieve) });
      } catch {
        const seed = S01_PROOF_SEED.find((p) => p.slug === row.slug);
        if (seed) pairs.push(seed);
      }
    }
    return {
      overlap: crawl.glossaryOverlap.length,
      pairs: pairs.length ? pairs : S01_PROOF_SEED,
      source: "live" as const,
    };
  });
