import { Button } from "@/components/ui/button";
import { recrawl } from "@/lib/server/ops";
import { retrieveBrand } from "@/lib/server/orgs";
import { familyPageCount, isSeedFamily } from "@/lib/org/catalog";
import { useStudio } from "@/store/studio";
import { useState } from "react";

export function EmptyFamilyCrawl({
  title,
  detail,
}: {
  title?: string;
  detail?: string;
}) {
  const graphOrg = useStudio((s) => s.graphOrg);
  const parentSlug = useStudio((s) => s.parentSlug);
  const parentId = useStudio((s) => s.parentId);
  const allBrands = useStudio((s) => s.allBrands);
  const bumpFamily = useStudio((s) => s.bumpFamily);
  const name = graphOrg?.parent?.name ?? "this family";
  const seed = isSeedFamily(graphOrg, parentSlug);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const pages = familyPageCount(graphOrg);

  return (
    <div className="flex min-h-0 flex-1 flex-col items-start gap-3 p-4">
      <p className="text-[10px] uppercase tracking-wide text-subtle">View the issue</p>
      <h2 className="font-display text-xl text-fg">{title ?? `No issues for ${name}`}</h2>
      <p className="max-w-md text-sm text-muted">
        {detail ??
          (seed
            ? "Pick an issue from the graph, Issues, or Validation — this panel stays empty until you do."
            : `Nothing crawled for ${name} yet. Live crawl the sub-company sites to fill issues. Don't mix in FDR × Achieve seed findings.`)}
      </p>
      {pages ? <p className="font-mono text-xs text-subtle">{pages.toLocaleString()} sitemap URLs on file</p> : null}
      <Button
        size="sm"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setMsg(null);
          const run = seed
            ? recrawl().then((r) => `Crawled FDR ${r.counts.fdr} · Achieve ${r.counts.achieve}`)
            : Promise.all(
                allBrands
                  .filter((b) => b.parentId === parentId && b.website)
                  .map((b) => retrieveBrand({ data: { id: b.id } })),
              ).then((rows) => {
                bumpFamily();
                return `Retrieved ${rows.length} brand homepage${rows.length === 1 ? "" : "s"}`;
              });
          void run
            .then((m) => setMsg(m))
            .catch((e) => setMsg(e instanceof Error ? e.message : "Crawl failed"))
            .finally(() => setBusy(false));
        }}
      >
        {busy ? "Crawling…" : "Live crawl"}
      </Button>
      {msg ? <p className="text-sm text-ok">{msg}</p> : null}
    </div>
  );
}
