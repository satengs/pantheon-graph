import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useStudio } from "@/store/studio";
import { deleteTask, listStudio, upsertTask } from "@/lib/server/studio-db";
import { filterIssues } from "@/lib/studio/query";
import { RULES } from "@/data/rules-seed";

type Task = { id: string; rule_id: string | null; title: string; notes: string; status: string };

export function Backlog() {
  const brand = useStudio((s) => s.brand);
  const product = useStudio((s) => s.product);
  const layer = useStudio((s) => s.layer);
  const impact = useStudio((s) => s.impact);
  const query = useStudio((s) => s.query);
  const selectIssue = useStudio((s) => s.selectIssue);
  const hoverIssue = useStudio((s) => s.hoverIssue);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const allowed = new Set(filterIssues(RULES, { brand, product, layer, impact, query }).map((r) => r.id));

  async function reload() {
    try {
      const data = await listStudio();
      setTasks(data.tasks);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load tasks");
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  const visible = tasks.filter((t) => {
    if (query.trim() && !`${t.title} ${t.notes}`.toLowerCase().includes(query.toLowerCase())) return false;
    if (!t.rule_id) return true;
    const code = t.rule_id.split(":").pop();
    return !code || allowed.has(code) || allowed.has(t.rule_id);
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
      <p className="text-sm text-muted">
        Your work list. These are site fixes to run against the rules — not studio build tickets.
      </p>
      {err ? <p className="text-sm text-danger">{err}</p> : null}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return;
          void upsertTask({ data: { title: title.trim() } }).then(() => {
            setTitle("");
            void reload();
          });
        }}
      >
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a task"
          className="h-9 flex-1 rounded-md bg-surface px-3 text-sm shadow-[var(--shadow-border)]"
        />
        <Button type="submit" size="sm">
          Add
        </Button>
      </form>
      <p className="text-xs text-subtle">Showing {visible.length} of {tasks.length}</p>
      <ul className="grid gap-2 md:grid-cols-2">
        {visible.map((t) => {
          const code = t.rule_id?.split(":").pop() ?? null;
          return (
            <li key={t.id}>
              <div
                className="flex w-full flex-col items-start gap-2 rounded-xl bg-bg p-3 text-left shadow-[var(--shadow-border)] hover:bg-raised/70"
                onMouseEnter={() => code && hoverIssue(code)}
                onMouseLeave={() => hoverIssue(null)}
                title={t.notes}
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <button type="button" className="font-medium text-fg" onClick={() => code && selectIssue(code)}>
                    {t.title}
                  </button>
                  <Badge tone={t.status === "done" ? "ok" : "warn"}>{t.status}</Badge>
                </div>
                {t.notes ? <p className="line-clamp-2 text-xs text-muted">{t.notes}</p> : null}
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      void upsertTask({
                        data: { id: t.id, title: t.title, notes: t.notes, status: t.status === "done" ? "open" : "done" },
                      }).then(reload)
                    }
                  >
                    {t.status === "done" ? "Reopen" : "Done"}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => void deleteTask({ data: { id: t.id } }).then(reload)}>
                    Remove
                  </Button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
