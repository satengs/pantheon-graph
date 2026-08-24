import { ExternalLink } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { RULES } from "@/data/rules-seed";
import { Badge } from "@/components/ui/badge";
import { useStudio } from "@/store/studio";
import { PRODUCT_LABEL } from "@/lib/graph/types";
import { cmp, filterIssues } from "@/lib/studio/query";
import type { BacklogItem } from "@/lib/graph/types";

const COLS: { key: keyof BacklogItem | "live"; label: string }[] = [
  { key: "code", label: "ID" },
  { key: "domain", label: "Domain" },
  { key: "product", label: "Product" },
  { key: "reason", label: "Reason" },
  { key: "fix", label: "Fix" },
  { key: "impact", label: "Impact" },
  { key: "live", label: "Live" },
];

export function ValidationTable() {
  const brand = useStudio((s) => s.brand);
  const product = useStudio((s) => s.product);
  const layer = useStudio((s) => s.layer);
  const impact = useStudio((s) => s.impact);
  const query = useStudio((s) => s.query);
  const selectedIssueId = useStudio((s) => s.selectedIssueId);
  const selectIssue = useStudio((s) => s.selectIssue);
  const hoverIssue = useStudio((s) => s.hoverIssue);
  const selectedIssueIds = useStudio((s) => s.selectedIssueIds);
  const toggleIssueSelect = useStudio((s) => s.toggleIssueSelect);
  const sortKey = useStudio((s) => s.sortKey);
  const sortDir = useStudio((s) => s.sortDir);
  const setSort = useStudio((s) => s.setSort);

  const rows = filterIssues(RULES, { brand, product, layer, impact, query }).slice().sort((a, b) => {
    const key = sortKey as keyof BacklogItem;
    const av = key === "product" ? String(a.product) : String(a[key] ?? "");
    const bv = key === "product" ? String(b.product) : String(b[key] ?? "");
    return cmp(av, bv, sortDir);
  });

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <p className="border-b border-border px-3 py-2 text-xs text-muted">
        Showing {rows.length} of {RULES.length} rules
      </p>
      <table className="w-full min-w-[720px] border-collapse text-left text-sm">
        <thead className="sticky top-0 bg-surface text-[10px] uppercase tracking-wide text-subtle">
          <tr>
            <th className="w-8 px-3 py-2 font-medium" />
            {COLS.map((c) => (
              <th key={c.key} className="px-2 py-2 font-medium">
                <button type="button" className="inline-flex items-center gap-1" onClick={() => setSort(c.key)}>
                  {c.label}
                  {sortKey === c.key ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((i) => (
            <tr
              key={i.id}
              onClick={() => selectIssue(i.id)}
              onMouseEnter={() => hoverIssue(i.id)}
              onMouseLeave={() => hoverIssue(null)}
              title={`${i.code} · ${i.title}\n${i.reason}`}
              className={`cursor-pointer border-t border-border/80 hover:bg-raised/70 ${
                selectedIssueId === i.id ? "bg-raised" : ""
              }`}
            >
              <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--color-accent)]"
                  checked={selectedIssueIds.includes(i.id)}
                  onChange={() => toggleIssueSelect(i.id)}
                  aria-label={`Select ${i.code}`}
                />
              </td>
              <td className="px-2 py-3 font-mono text-xs text-fg">{i.code}</td>
              <td className="px-2 py-3">
                <Badge
                  tone={i.domain === "fdr" ? "fdr" : i.domain === "achieve" ? "achieve" : "neutral"}
                >
                  {i.domain}
                </Badge>
              </td>
              <td className="px-2 py-3 text-muted">
                {i.product === "all" ? "all" : PRODUCT_LABEL[i.product]}
              </td>
              <td className="max-w-[280px] px-2 py-3 text-muted">
                <span className="line-clamp-2">{i.reason}</span>
              </td>
              <td className="max-w-[280px] px-2 py-3 text-fg">
                <span className="line-clamp-2">{i.fix}</span>
              </td>
              <td className="px-2 py-3">
                <Badge tone={i.impact === "critical" ? "danger" : i.impact === "high" ? "warn" : "neutral"}>
                  {i.impact}
                </Badge>
              </td>
              <td className="px-2 py-3">
                {i.urls[0] ? (
                  <a
                    href={i.urls[0]}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex text-fdr hover:underline"
                  >
                    <ExternalLink className="size-4" />
                  </a>
                ) : (
                  <span className="text-subtle">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 ? (
        <div className="p-8 text-center">
          <p className="text-sm text-muted">No rules match these filters.</p>
          <Link to="/empty" search={{ q: query || `${brand}/${product}/${layer}` }} className="mt-2 inline-block text-sm text-fdr hover:underline">
            Open empty-data page
          </Link>
        </div>
      ) : null}
    </div>
  );
}
