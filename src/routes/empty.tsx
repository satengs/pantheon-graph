import { createFileRoute, Link } from "@tanstack/react-router";
import { crawl } from "@/data/crawl";
import { RULES } from "@/data/rules-seed";

type EmptySearch = { q?: string; url?: string };

export const Route = createFileRoute("/empty")({
  validateSearch: (s: Record<string, unknown>): EmptySearch => ({
    q: typeof s.q === "string" ? s.q : undefined,
    url: typeof s.url === "string" ? s.url : undefined,
  }),
  component: EmptyDataPage,
});

function EmptyDataPage() {
  const { q, url } = Route.useSearch();
  const live = url || RULES[0]?.urls[0] || crawl.source.fdr;
  const shot = `https://s.wordpress.com/mshots/v1/${encodeURIComponent(live)}?w=1200`;
  return (
    <main className="min-h-dvh bg-bg px-4 py-8 text-fg">
      <div className="mx-auto max-w-3xl">
        <p className="text-[10px] uppercase tracking-[0.18em] text-subtle">Empty catalog</p>
        <h1 className="mt-2 font-display text-3xl">No rows for this filter</h1>
        <p className="mt-2 text-sm text-muted">
          {q ? `Filter: ${q}. ` : ""}
          Origin has no matching issues or states. The live page snapshot below is from the crawl catalog
          ({crawl.counts.fdr} FDR · {crawl.counts.achieve} Achieve, {crawl.crawledAt.slice(0, 10)}).
        </p>
        <Link to="/" className="mt-4 inline-block text-sm text-fdr hover:underline">
          Back to dashboard
        </Link>
        <a href={live} target="_blank" rel="noreferrer" className="mt-6 block overflow-hidden rounded-2xl bg-surface shadow-[var(--shadow-border)]">
          <img src={shot} alt="Live page snapshot" className="w-full" />
          <p className="px-4 py-3 font-mono text-xs text-muted">{live}</p>
        </a>
      </div>
    </main>
  );
}
