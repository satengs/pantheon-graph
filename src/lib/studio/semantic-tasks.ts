import { useEffect, useState } from "react";
import { BUILD_SHA } from "@/lib/build-info";

export type TaskSeverity = "critical" | "high" | "medium" | "low";
export type TaskBrand = "fdr" | "achieve" | "bills";
export type TaskWorkStatus = "open" | "in_progress" | "done";
/** Where an issue shows up: identical in server HTML and client DOM, only after hydration, or different. */
export type TaskRenderSource = "server+client" | "client-only" | "diff";

export const RENDER_SOURCE_ORDER: TaskRenderSource[] = ["server+client", "client-only", "diff"];

export const RENDER_SOURCE_LABEL: Record<TaskRenderSource, string> = {
  "server+client": "Server + Client",
  "client-only": "Client-only",
  diff: "Server vs Client diff",
};

export function taskRenderSource(t: { renderSource?: string | null }): TaskRenderSource {
  return t.renderSource === "client-only" || t.renderSource === "diff"
    ? t.renderSource
    : "server+client";
}

export type TaskUrl = {
  url: string;
  /** Present only when the sitemap URL redirected to `url`. */
  requestedUrl?: string;
  hub: string | null;
  section: string | null;
  countOnPage: number | null;
  inCrawl: boolean;
  graphNodeId: string | null;
  renderSource?: TaskRenderSource;
  /** "server" = found by the full-site server-HTML sweep only (client DOM not rendered for this URL). */
  tier?: "server" | "chromium";
  serverLabel?: string | null;
  clientLabel?: string | null;
  ssrDiff?: string | null;
};

export type TaskExample = {
  url: string;
  hub: string | null;
  section: string | null;
  selector: string;
  snippet: string;
  countOnPage: number | null;
  variant: string | null;
  h1Texts?: string[];
  clientInjected?: boolean;
  renderSource?: TaskRenderSource;
  serverLabel?: string | null;
  clientLabel?: string | null;
};

export type SemanticTask = {
  id: string;
  brand: TaskBrand;
  brandLabel: string;
  category: string;
  severity: TaskSeverity;
  title: string;
  problem: string;
  reason: string;
  fix: string;
  owner: string;
  sourceOwner?: string;
  tags: string[];
  rule: string;
  hubs: string[];
  sections: string[];
  pageCount: number;
  occurrenceCount: number;
  scopeLabel: string;
  graphNodeId: string | null;
  renderSource?: TaskRenderSource;
  renderCounts?: { serverClient: number; clientOnly: number; diff: number };
  ssrDiff?: string | null;
  renderDiff?: { url: string; server: string; client: string } | null;
  affectedUrls: TaskUrl[];
  /** Real number of affected URLs; affectedUrls may be capped for payload size. */
  affectedUrlsTotal?: number;
  examples: TaskExample[];
  variants: Array<{ variant: string; pages?: number | null }>;
};

export type CoverageCount = { checked: number; total: number };
export type AuditCoverage = {
  server: { checked: number; total: number; byBrand: Record<TaskBrand, CoverageCount> };
  chromium: { checked: number; total: number; byBrand: Record<TaskBrand, CoverageCount> };
};

export type SemanticTasksDoc = {
  auditedAt: string;
  auditedAtLabel: string;
  coverage?: AuditCoverage | null;
  pagesAudited: number;
  htmlParsed: number;
  nonHtmlCount: number;
  timezone: string;
  totals: {
    tasks: number;
    byBrand: Record<TaskBrand, number>;
    bySeverity: Record<TaskSeverity, number>;
    byRenderSource?: Record<TaskRenderSource, number>;
  };
  tasks: SemanticTask[];
};

const STATUS_KEY = "pantheon-graph:semantic-task-status:v1";

export const TASK_STATUS_LABEL: Record<TaskWorkStatus, string> = {
  open: "Open",
  in_progress: "In Progress",
  done: "Done",
};

export const SEVERITY_ORDER: TaskSeverity[] = ["critical", "high", "medium", "low"];

export type TaskFilters = {
  brand: "all" | TaskBrand;
  owner: "all" | string;
  category: "all" | string;
  severity: "all" | TaskSeverity;
  status: "all" | TaskWorkStatus;
  render: "all" | TaskRenderSource;
  query: string;
};

export function emptyTaskFilters(): TaskFilters {
  return {
    brand: "all",
    owner: "all",
    category: "all",
    severity: "all",
    status: "all",
    render: "all",
    query: "",
  };
}

export function loadTaskStatuses(): Record<string, TaskWorkStatus> {
  try {
    const raw = localStorage.getItem(STATUS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    const out: Record<string, TaskWorkStatus> = {};
    for (const [id, v] of Object.entries(parsed)) {
      if (v === "open" || v === "in_progress" || v === "done") out[id] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export function saveTaskStatuses(map: Record<string, TaskWorkStatus>) {
  try {
    localStorage.setItem(STATUS_KEY, JSON.stringify(map));
  } catch {
    /* ignore quota / private mode */
  }
}

export function taskStatus(id: string, map: Record<string, TaskWorkStatus>): TaskWorkStatus {
  return map[id] ?? "open";
}

export function filterTasks(
  tasks: SemanticTask[],
  filters: TaskFilters,
  statuses: Record<string, TaskWorkStatus>,
): SemanticTask[] {
  const q = filters.query.trim().toLowerCase();
  return tasks.filter((t) => {
    if (filters.brand !== "all" && t.brand !== filters.brand) return false;
    if (filters.owner !== "all" && t.owner !== filters.owner) return false;
    if (filters.category !== "all" && t.category !== filters.category) return false;
    if (filters.severity !== "all" && t.severity !== filters.severity) return false;
    if (filters.status !== "all" && taskStatus(t.id, statuses) !== filters.status) return false;
    if (filters.render !== "all" && taskRenderSource(t) !== filters.render) return false;
    if (!q) return true;
    const hay = [
      t.title,
      t.problem,
      t.reason,
      t.fix,
      t.owner,
      ...(t.tags ?? []),
      t.rule,
      t.category,
      t.scopeLabel,
      RENDER_SOURCE_LABEL[taskRenderSource(t)],
      t.ssrDiff ?? "",
      ...t.affectedUrls.map((u) => u.url),
      ...t.examples.flatMap((e) => [e.url, e.selector, e.snippet]),
    ]
      .join("\n")
      .toLowerCase();
    return hay.includes(q);
  });
}

export function sortTasks(tasks: SemanticTask[]): SemanticTask[] {
  return tasks.slice().sort((a, b) => {
    const s = SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity);
    if (s) return s;
    if (b.pageCount !== a.pageCount) return b.pageCount - a.pageCount;
    return a.title.localeCompare(b.title);
  });
}

const SERVICE_OWNER_ORDER = ["Public", "Loans", "Apply", "Enroll", "Dashboard", "Login"];

export function uniqueOwners(tasks: SemanticTask[]): string[] {
  const present = new Set(tasks.map((t) => t.owner));
  const known = SERVICE_OWNER_ORDER.filter((s) => present.has(s));
  const extra = [...present]
    .filter((s) => !SERVICE_OWNER_ORDER.includes(s))
    .sort((a, b) => a.localeCompare(b));
  return [...known, ...extra];
}

export function uniqueCategories(tasks: SemanticTask[]): string[] {
  return [...new Set(tasks.map((t) => t.category))].sort((a, b) => a.localeCompare(b));
}

export function categoryLabel(cat: string): string {
  if (!cat) return cat;
  if (cat === "ssr") return "SSR";
  if (cat === "seo-outline") return "SEO outline";
  if (cat === "seo-links") return "SEO links";
  return cat
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

let inflight: Promise<SemanticTasksDoc | null> | null = null;

export function loadSemanticTasks(): Promise<SemanticTasksDoc | null> {
  inflight ??= fetch(`/data/semantic-tasks.json?v=${encodeURIComponent(BUILD_SHA)}`, {
    cache: "no-cache",
  })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  return inflight;
}

export function useSemanticTasks() {
  const [doc, setDoc] = useState<SemanticTasksDoc | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void loadSemanticTasks().then((d) => {
      if (cancelled) return;
      if (!d) setError(true);
      else setDoc(d);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return { doc, error };
}
