import { Badge } from "@/components/ui/badge";
import { blockingIssuesForUrl, pageMetaBlocksLive, pageMetaForUrl } from "@/lib/studio/page-meta";

export function PageMeta({ url, variant = "inspector" }: { url?: string; variant?: "inspector" | "drawer" }) {
  const meta = url ? pageMetaForUrl(url) : null;
  const drawer = variant === "drawer";
  if (!meta) {
    if (drawer) return null;
    return (
      <section>
        <h3 className="text-[11px] font-medium uppercase tracking-wide text-subtle">Canonical + metadata</h3>
        <p className="mt-1 text-sm text-muted">No crawl snapshot for this page.</p>
      </section>
    );
  }

  const rows: Array<[string, string]> = [];
  if (meta.canonical) rows.push(["rel=canonical", meta.canonical]);
  if (meta.robots) rows.push(["robots", meta.robots]);
  if (meta.title) rows.push(["title", meta.title]);
  if (meta.h1) rows.push(["H1", meta.h1]);
  if (meta.ogTitle) rows.push(["og:title", meta.ogTitle]);
  if (meta.description) rows.push(["meta description", meta.description]);
  if (meta.hrefCount != null) rows.push(["crawlable a[href]", String(meta.hrefCount)]);

  if (drawer && rows.length === 0) return null;

  const blocks = pageMetaBlocksLive(meta);
  return (
    <section>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-medium uppercase tracking-wide text-subtle">Canonical + metadata</h3>
        {drawer ? null : (
          <Badge tone={blocks ? "danger" : "ok"}>{blocks ? "Blocks live" : "Doesn't block live"}</Badge>
        )}
      </div>
      {rows.length ? (
        <ul className="mt-2 space-y-1.5">
          {rows.map(([k, v]) => (
            <li key={k} className="rounded-md bg-raised px-2.5 py-1.5">
              <p className="text-[10px] uppercase tracking-wide text-subtle">{k}</p>
              <p className="font-mono text-xs text-fg break-all">{v}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-sm text-muted">No crawl snapshot for this page.</p>
      )}
      {!drawer && blocks ? (
        <p className="mt-2 text-xs text-danger text-pretty">
          {(() => {
            const hits = blockingIssuesForUrl(meta.url);
            if (!hits.length) return null;
            const first = hits[0]!;
            const extra = hits.length > 1 ? ` · +${hits.length - 1} more` : "";
            return `${first.code} ${first.title}${extra}`;
          })()}
        </p>
      ) : !drawer && meta.selfCanonical ? (
        <p className="mt-2 text-xs text-muted">rel=canonical points at this page.</p>
      ) : null}
    </section>
  );
}
