import { ISSUES } from "@/data/issues";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useStudio } from "@/store/studio";

export function Backlog() {
  const selectedIssueIds = useStudio((s) => s.selectedIssueIds);
  const toggleIssueSelect = useStudio((s) => s.toggleIssueSelect);
  const clearIssueSelect = useStudio((s) => s.clearIssueSelect);
  const selectIssue = useStudio((s) => s.selectIssue);
  const selected = ISSUES.filter((i) => selectedIssueIds.includes(i.id));

  function exportSuggestions() {
    const body = selected
      .map(
        (i) =>
          `## ${i.code} ${i.title}\nDomain: ${i.domain} · Product: ${i.product} · Impact: ${i.impact}\n\nReason: ${i.reason}\n\nFix: ${i.fix}\n\nURLs:\n${i.urls.map((u) => `- ${u}`).join("\n")}\n`,
      )
      .join("\n");
    const blob = new Blob([body || "Select items in the Validation tab first."], {
      type: "text/markdown",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "origin-suggestions.md";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">
          Multi-select issues in Validation, then export a suggestion packet for CMS.
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={clearIssueSelect}>
            Clear
          </Button>
          <Button size="sm" onClick={exportSuggestions} disabled={selected.length === 0}>
            Export {selected.length || ""} suggestions
          </Button>
        </div>
      </div>
      <ul className="grid gap-2 md:grid-cols-2">
        {ISSUES.map((i) => {
          const on = selectedIssueIds.includes(i.id);
          return (
            <li key={i.id}>
              <button
                type="button"
                onClick={() => {
                  toggleIssueSelect(i.id);
                  selectIssue(i.id);
                }}
                className={`flex w-full flex-col items-start gap-2 rounded-xl p-3 text-left shadow-[var(--shadow-border)] ${
                  on ? "bg-raised" : "bg-bg"
                }`}
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <span className="font-mono text-xs">{i.code}</span>
                  <Badge tone={i.status === "studio" ? "ok" : i.status === "open" ? "danger" : "warn"}>
                    {i.status}
                  </Badge>
                </div>
                <span className="font-medium text-fg">{i.title}</span>
                <span className="line-clamp-2 text-xs text-muted">{i.fix}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
