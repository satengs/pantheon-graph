import { ExternalLink } from "lucide-react";
import { ISSUES } from "@/data/issues";
import { Badge } from "@/components/ui/badge";
import { useStudio } from "@/store/studio";
import { PRODUCT_LABEL } from "@/lib/graph/types";

export function ValidationTable() {
  const brand = useStudio((s) => s.brand);
  const product = useStudio((s) => s.product);
  const layer = useStudio((s) => s.layer);
  const impact = useStudio((s) => s.impact);
  const query = useStudio((s) => s.query);
  const selectedIssueId = useStudio((s) => s.selectedIssueId);
  const selectIssue = useStudio((s) => s.selectIssue);
  const selectedIssueIds = useStudio((s) => s.selectedIssueIds);
  const toggleIssueSelect = useStudio((s) => s.toggleIssueSelect);

  const rows = ISSUES.filter((i) => {
    if (brand !== "all" && i.domain !== "both" && i.domain !== "system" && i.domain !== brand) {
      return false;
    }
    if (product !== "all" && i.product !== "all" && i.product !== product) return false;
    if (layer !== "all" && i.layer !== layer) return false;
    if (impact !== "all" && i.impact !== impact) return false;
    if (query.trim()) {
      const q = query.toLowerCase();
      const blob = `${i.code} ${i.title} ${i.reason} ${i.fix}`.toLowerCase();
      if (!blob.includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <table className="w-full min-w-[720px] border-collapse text-left text-sm">
        <thead className="sticky top-0 bg-surface text-[10px] uppercase tracking-wide text-subtle">
          <tr>
            <th className="w-8 px-3 py-2 font-medium" />
            <th className="px-2 py-2 font-medium">ID</th>
            <th className="px-2 py-2 font-medium">Domain</th>
            <th className="px-2 py-2 font-medium">Product</th>
            <th className="px-2 py-2 font-medium">Reason</th>
            <th className="px-2 py-2 font-medium">Fix</th>
            <th className="px-2 py-2 font-medium">Impact</th>
            <th className="px-2 py-2 font-medium">Live</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((i) => (
            <tr
              key={i.id}
              onClick={() => selectIssue(i.id)}
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
        <p className="p-8 text-center text-sm text-muted">No issues match these filters.</p>
      ) : null}
    </div>
  );
}
