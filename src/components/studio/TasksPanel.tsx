import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronRight, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import {
  type SemanticTask,
  type TaskBrand,
  type TaskFilters,
  type TaskSeverity,
  type TaskWorkStatus,
  TASK_STATUS_LABEL,
  categoryLabel,
  emptyTaskFilters,
  filterTasks,
  loadTaskStatuses,
  saveTaskStatuses,
  sortTasks,
  taskStatus,
  uniqueCategories,
  uniqueOwners,
  useSemanticTasks,
} from "@/lib/studio/semantic-tasks";
import { useStudio } from "@/store/studio";

const BRAND_PILL: Record<TaskBrand, string> = {
  fdr: "bg-fdr/20 text-fdr",
  achieve: "bg-achieve/20 text-achieve",
  bills: "bg-bills/20 text-bills",
};

const BRAND_FILTER_LABEL: Record<TaskBrand, string> = {
  fdr: "FDR",
  achieve: "Achieve",
  bills: "Bills.com",
};

const SEV_PILL: Record<TaskSeverity, string> = {
  critical: "bg-danger/20 text-danger",
  high: "bg-[#ff8c1a]/20 text-[#ff8c1a]",
  medium: "bg-[#b8e04a]/20 text-[#c6e86a]",
  low: "bg-raised text-muted",
};

const SEV_LETTER: Record<TaskSeverity, string> = {
  critical: "C",
  high: "H",
  medium: "M",
  low: "L",
};

function Pill({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center rounded-sm px-1.5 text-[10px] font-medium uppercase tracking-wide",
        className,
      )}
    >
      {children}
    </span>
  );
}

function openInGraph(nodeId: string) {
  const store = useStudio.getState();
  store.setTab("graph");
  store.selectNode(nodeId);
  store.setGraphInspectorOpen(true);
}

export function TasksPanel() {
  const { doc, error } = useSemanticTasks();
  const [filters, setFilters] = useState<TaskFilters>(emptyTaskFilters);
  const [statuses, setStatuses] = useState<Record<string, TaskWorkStatus>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [urlLimit, setUrlLimit] = useState(8);
  const didInitOpen = useRef(false);

  useEffect(() => {
    setStatuses(loadTaskStatuses());
    try {
      const id = new URLSearchParams(window.location.search).get("task");
      if (id) {
        setOpenId(id);
        didInitOpen.current = true;
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      const u = new URL(window.location.href);
      if (openId) u.searchParams.set("task", openId);
      else u.searchParams.delete("task");
      if (u.href !== window.location.href) window.history.replaceState(window.history.state, "", u.href);
    } catch {
      /* ignore */
    }
  }, [openId]);

  const owners = useMemo(() => (doc ? uniqueOwners(doc.tasks) : []), [doc]);
  const categories = useMemo(() => (doc ? uniqueCategories(doc.tasks) : []), [doc]);
  const visible = useMemo(() => {
    if (!doc) return [];
    return sortTasks(filterTasks(doc.tasks, filters, statuses));
  }, [doc, filters, statuses]);

  useEffect(() => {
    if (!visible.length) return;
    if (openId && visible.some((t) => t.id === openId)) {
      didInitOpen.current = true;
      return;
    }
    // First load (or a deep link): open the first visible card once.
    if (!didInitOpen.current) {
      setOpenId(visible[0]!.id);
      didInitOpen.current = true;
      setUrlLimit(8);
      return;
    }
    // After the user collapses the open card, stay collapsed. If filters
    // hide the open task, close it rather than forcing another card open.
    if (openId && !visible.some((t) => t.id === openId)) setOpenId(null);
  }, [visible, openId]);

  function setStatus(id: string, status: TaskWorkStatus) {
    setStatuses((prev) => {
      const next = { ...prev, [id]: status };
      saveTaskStatuses(next);
      return next;
    });
  }

  if (error) {
    return (
      <section className="min-h-0 flex-1 overflow-auto p-4" data-testid="tasks-panel">
        <p className="text-sm text-muted">The semantic HTML task list could not be loaded.</p>
      </section>
    );
  }
  if (!doc) {
    return (
      <section className="min-h-0 flex-1 overflow-auto p-4" data-testid="tasks-panel">
        <p className="text-sm text-muted">Loading tasks…</p>
      </section>
    );
  }

  const { totals } = doc;

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden" data-testid="tasks-panel">
      <div
        className="shrink-0 border-b border-border bg-surface px-4 py-3"
        data-testid="tasks-summary"
        aria-label="Task summary"
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm text-fg">Tasks</h2>
            <p className="mt-0.5 text-xs text-subtle">{doc.auditedAtLabel}</p>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
            <span>
              <span className="font-medium tabular-nums text-fg">{totals.tasks}</span> tasks
            </span>
            <span>
              FDR {totals.byBrand.fdr} · Achieve {totals.byBrand.achieve} · Bills.com {totals.byBrand.bills}
            </span>
            <span className="inline-flex items-center gap-1 tabular-nums" title="Semantic HTML severity — not Pantheon C/H/M/L">
              <span className="text-danger">C{totals.bySeverity.critical}</span>
              <span className="text-[#ff8c1a]">H{totals.bySeverity.high}</span>
              <span className="text-[#c6e86a]">M{totals.bySeverity.medium}</span>
              <span className="text-muted">L{totals.bySeverity.low}</span>
            </span>
          </div>
        </div>
        <p className="mt-2 max-w-3xl text-[11px] leading-snug text-subtle">
          Semantic HTML audit only. These counts are not Pantheon C/H/M/L and are not Evidence findings.
        </p>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-bg px-4 py-2" role="group" aria-label="Task filters">
        <FilterSelect
          label="Brand"
          testId="task-filter-brand"
          value={filters.brand}
          onChange={(v) => setFilters((f) => ({ ...f, brand: v as TaskFilters["brand"] }))}
          options={[
            { value: "all", label: "All" },
            { value: "fdr", label: "FDR" },
            { value: "achieve", label: "Achieve" },
            { value: "bills", label: "Bills.com" },
          ]}
        />
        <FilterSelect
          label="Service owner"
          testId="task-filter-owner"
          value={filters.owner}
          onChange={(v) => setFilters((f) => ({ ...f, owner: v }))}
          options={[{ value: "all", label: "All" }, ...owners.map((o) => ({ value: o, label: o }))]}
        />
        <FilterSelect
          label="Issue type"
          testId="task-filter-category"
          value={filters.category}
          onChange={(v) => setFilters((f) => ({ ...f, category: v }))}
          options={[{ value: "all", label: "All" }, ...categories.map((c) => ({ value: c, label: categoryLabel(c) }))]}
        />
        <FilterSelect
          label="Severity"
          testId="task-filter-severity"
          value={filters.severity}
          onChange={(v) => setFilters((f) => ({ ...f, severity: v as TaskFilters["severity"] }))}
          options={[
            { value: "all", label: "All" },
            { value: "critical", label: "Critical" },
            { value: "high", label: "High" },
            { value: "medium", label: "Medium" },
            { value: "low", label: "Low" },
          ]}
        />
        <FilterSelect
          label="Status"
          testId="task-filter-status"
          value={filters.status}
          onChange={(v) => setFilters((f) => ({ ...f, status: v as TaskFilters["status"] }))}
          options={[
            { value: "all", label: "All" },
            { value: "open", label: "Open" },
            { value: "in_progress", label: "In Progress" },
            { value: "done", label: "Done" },
          ]}
        />
        <label className="flex min-w-[12rem] flex-1 items-center gap-2 text-xs text-muted">
          <span className="shrink-0">Search</span>
          <input
            type="search"
            value={filters.query}
            onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))}
            placeholder="Title, URL, snippet, problem, fix"
            className="h-8 min-w-0 flex-1 rounded-md border border-border bg-surface px-2 text-xs text-fg placeholder:text-subtle"
          />
        </label>
        <span className="text-[11px] tabular-nums text-subtle">{visible.length} shown</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-3">
        {visible.length === 0 ? (
          <p className="text-sm text-muted">No tasks match these filters.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {visible.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                status={taskStatus(task.id, statuses)}
                expanded={openId === task.id}
                urlLimit={openId === task.id ? urlLimit : 8}
                onToggle={() => {
                  setOpenId((id) => (id === task.id ? null : task.id));
                  setUrlLimit(8);
                }}
                onStatus={(s) => setStatus(task.id, s)}
                onShowAllUrls={() => setUrlLimit(task.affectedUrls.length)}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function FilterSelect({
  label,
  testId,
  value,
  onChange,
  options,
}: {
  label: string;
  testId?: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-muted">
      <span className="shrink-0">{label}</span>
      <select
        data-testid={testId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 max-w-[14rem] rounded-md border border-border bg-surface px-1.5 text-xs text-fg"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function TaskRow({
  task,
  status,
  expanded,
  urlLimit,
  onToggle,
  onStatus,
  onShowAllUrls,
}: {
  task: SemanticTask;
  status: TaskWorkStatus;
  expanded: boolean;
  urlLimit: number;
  onToggle: () => void;
  onStatus: (s: TaskWorkStatus) => void;
  onShowAllUrls: () => void;
}) {
  const example = task.examples[0];
  const urls = task.affectedUrls.slice(0, urlLimit);
  const hidden = task.affectedUrls.length - urls.length;

  return (
    <li
      data-task-id={task.id}
      data-task-severity={task.severity}
      data-task-brand={task.brand}
      className="min-w-0 rounded-md border border-border bg-surface"
    >
      <div className="flex flex-wrap items-start gap-2 px-3 py-2.5">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-label={expanded ? `Collapse ${task.title}` : `Expand ${task.title}`}
          className="flex min-w-0 flex-1 items-start gap-2 text-left"
        >
          <ChevronRight
            className={cn(
              "mt-0.5 size-4 shrink-0 text-subtle transition-transform duration-150",
              expanded && "rotate-90",
            )}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Pill className={BRAND_PILL[task.brand]}>{BRAND_FILTER_LABEL[task.brand]}</Pill>
            <Pill className={SEV_PILL[task.severity]}>
              {SEV_LETTER[task.severity]} {task.severity}
            </Pill>
            <span className="text-[11px] text-subtle">{categoryLabel(task.category)}</span>
            <span className="text-[11px] text-muted">{task.owner}</span>
            {(task.tags ?? []).map((tag) => (
              <span key={tag} className="inline-flex h-5 items-center rounded-sm bg-raised px-1.5 text-[10px] text-subtle">
                {tag}
              </span>
            ))}
            <span className="text-[11px] tabular-nums text-muted">{task.scopeLabel}</span>
          </div>
          <h3 className="mt-1 text-sm text-fg [overflow-wrap:anywhere]">{task.title}</h3>
          <p className={cn("mt-1 text-xs leading-snug text-muted [overflow-wrap:anywhere]", !expanded && "line-clamp-2")}>
            {task.problem}
          </p>
          </div>
        </button>
        <label className="flex shrink-0 items-center gap-1.5 text-[11px] text-subtle">
          <span>Status</span>
          <select
            value={status}
            onChange={(e) => onStatus(e.target.value as TaskWorkStatus)}
            aria-label={`Status for ${task.title}`}
            className="h-7 rounded-md border border-border bg-bg px-1.5 text-[11px] text-fg"
          >
            {(Object.keys(TASK_STATUS_LABEL) as TaskWorkStatus[]).map((s) => (
              <option key={s} value={s}>
                {TASK_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {expanded ? (
        <div className="space-y-3 border-t border-border px-3 py-3">
          {example?.selector || example?.snippet ? (
            <div className="min-w-0">
              <h4 className="text-[11px] uppercase tracking-wide text-subtle">Element / snippet</h4>
              {example.selector ? (
                <p className="mt-1 overflow-x-auto font-mono text-[11px] leading-snug text-muted [overflow-wrap:anywhere]">
                  {example.selector}
                </p>
              ) : null}
              {example.snippet ? (
                <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-all rounded-md border border-border bg-bg p-2 font-mono text-[11px] leading-snug text-fg">
                  {example.snippet}
                </pre>
              ) : null}
            </div>
          ) : null}

          <div>
            <h4 className="text-[11px] uppercase tracking-wide text-subtle">Why it matters</h4>
            <p className="mt-1 text-xs leading-snug text-muted [overflow-wrap:anywhere]">{task.reason}</p>
          </div>
          <div>
            <h4 className="text-[11px] uppercase tracking-wide text-subtle">Fix</h4>
            <p className="mt-1 text-xs leading-snug text-fg [overflow-wrap:anywhere]">{task.fix}</p>
          </div>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-[11px] uppercase tracking-wide text-subtle">
                Affected URLs · {task.affectedUrls.length}
              </h4>
              {task.graphNodeId ? (
                <Button size="sm" variant="secondary" onClick={() => openInGraph(task.graphNodeId!)}>
                  Open in Graph
                </Button>
              ) : null}
            </div>
            <ul className="mt-1.5 space-y-0.5">
              {urls.map((u) => (
                <li key={u.url} className="flex min-w-0 flex-wrap items-center gap-2 text-xs">
                  <a
                    href={u.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-w-0 truncate text-accent underline-offset-2 hover:underline"
                  >
                    {u.url.replace(/^https:\/\//, "")}
                    <ExternalLink className="ml-1 inline size-3 align-[-1px] text-subtle" aria-hidden />
                  </a>
                  {u.graphNodeId ? (
                    <button
                      type="button"
                      className="shrink-0 text-[11px] text-subtle hover:text-fg"
                      onClick={() => openInGraph(u.graphNodeId!)}
                    >
                      Open in Graph
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
            {hidden > 0 ? (
              <button type="button" className="mt-1 text-[11px] text-muted hover:text-fg" onClick={onShowAllUrls}>
                Show all {task.affectedUrls.length} URLs
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </li>
  );
}
