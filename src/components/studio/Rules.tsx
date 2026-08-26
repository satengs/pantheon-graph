import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useStudio } from "@/store/studio";
import { deleteRule, listStudio, upsertRule } from "@/lib/server/studio-db";
import { filterIssues } from "@/lib/studio/query";
import { RULES } from "@/data/rules-seed";

type Rule = {
  id: string;
  code: string;
  title: string;
  layer: string;
  domain: string;
  product: string;
  statement: string;
};

const empty = {
  code: "",
  title: "",
  layer: "L1" as "L1" | "L2",
  domain: "both" as "fdr" | "achieve" | "both" | "system",
  product: "all",
  statement: "",
};

export function Rules() {
  const brand = useStudio((s) => s.brand);
  const product = useStudio((s) => s.product);
  const layer = useStudio((s) => s.layer);
  const impact = useStudio((s) => s.impact);
  const query = useStudio((s) => s.query);
  const selectIssue = useStudio((s) => s.selectIssue);
  const hoverIssue = useStudio((s) => s.hoverIssue);
  const [rules, setRules] = useState<Rule[]>([]);
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const seedIds = new Set(filterIssues(RULES, { brand, product, layer, impact, query }).map((r) => r.code));

  async function reload() {
    try {
      const data = await listStudio();
      setRules(data.rules);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load rules");
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  const visible = rules.filter((r) => {
    if (!seedIds.has(r.code) && (brand !== "all" || product !== "all" || layer !== "all" || query.trim())) {
      if (brand !== "all" && r.domain !== "both" && r.domain !== "system" && r.domain !== brand) return false;
      if (product !== "all" && r.product !== "all" && r.product !== product) return false;
      if (layer !== "all" && r.layer !== layer) return false;
      if (query.trim() && !`${r.code} ${r.title} ${r.statement}`.toLowerCase().includes(query.toLowerCase())) return false;
    }
    return true;
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
      <p className="text-sm text-muted">
        Common rules run on every brand. FDR and Achieve rules add brand pins (Organization @id, loan fields). Edit a rule, then run checks on crawled pages — you do not need to crawl again.
      </p>
      {err ? <p className="text-sm text-danger">{err}</p> : null}
      <form
        className="grid gap-2 rounded-xl bg-raised p-3 md:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          void upsertRule({
            data: {
              id: editId ?? undefined,
              ...form,
            },
          }).then(() => {
            setForm(empty);
            setEditId(null);
            void reload();
          });
        }}
      >
        <input
          required
          value={form.code}
          onChange={(e) => setForm({ ...form, code: e.target.value })}
          placeholder="Code (S21)"
          className="h-9 rounded-md bg-bg px-3 text-sm shadow-[var(--shadow-border)]"
        />
        <input
          required
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="Title"
          className="h-9 rounded-md bg-bg px-3 text-sm shadow-[var(--shadow-border)]"
        />
        <textarea
          required
          value={form.statement}
          onChange={(e) => setForm({ ...form, statement: e.target.value })}
          placeholder="Rule statement"
          className="min-h-20 rounded-md bg-bg px-3 py-2 text-sm shadow-[var(--shadow-border)] md:col-span-2"
        />
        <label className="text-xs text-muted">
          Applies to
          <select
            value={form.domain}
            onChange={(e) => setForm({ ...form, domain: e.target.value as typeof form.domain })}
            className="mt-1 h-9 w-full rounded-md bg-bg px-2 text-sm text-fg shadow-[var(--shadow-border)]"
          >
            <option value="both">Common — both brands</option>
            <option value="fdr">FDR only</option>
            <option value="achieve">Achieve only</option>
            <option value="system">System</option>
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-muted">
            Layer
            <select
              value={form.layer}
              onChange={(e) => setForm({ ...form, layer: e.target.value as "L1" | "L2" })}
              className="mt-1 h-9 w-full rounded-md bg-bg px-2 text-sm text-fg shadow-[var(--shadow-border)]"
            >
              <option value="L1">L1 — this page</option>
              <option value="L2">L2 — across brands</option>
            </select>
          </label>
          <label className="text-xs text-muted">
            Product
            <input
              value={form.product}
              onChange={(e) => setForm({ ...form, product: e.target.value })}
              placeholder="all"
              className="mt-1 h-9 w-full rounded-md bg-bg px-2 text-sm shadow-[var(--shadow-border)]"
            />
          </label>
        </div>
        <div className="flex gap-2 md:col-span-2">
          <Button type="submit" size="sm">
            {editId ? "Save rule" : "Create rule"}
          </Button>
          {editId ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setEditId(null);
                setForm(empty);
              }}
            >
              Cancel
            </Button>
          ) : null}
        </div>
      </form>
      <p className="text-xs text-subtle">Showing {visible.length} of {rules.length}</p>
      <ul className="space-y-2">
        {visible.map((r) => (
          <li
            key={r.id}
            className="rounded-xl bg-bg p-3 shadow-[var(--shadow-border)]"
            onMouseEnter={() => hoverIssue(r.code)}
            onMouseLeave={() => hoverIssue(null)}
            title={r.statement}
          >
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="font-mono text-xs" onClick={() => selectIssue(r.code)}>
                {r.code}
              </button>
              <span className="font-medium">{r.title}</span>
              <Badge>{r.layer}</Badge>
              <Badge tone={r.domain === "fdr" ? "fdr" : r.domain === "achieve" ? "achieve" : "neutral"}>
                {r.domain === "both" ? "common" : r.domain}
              </Badge>
            </div>
            <p className="mt-2 text-sm text-muted">{r.statement}</p>
            <div className="mt-2 flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditId(r.id);
                  setForm({
                    code: r.code,
                    title: r.title,
                    layer: r.layer as "L1" | "L2",
                    domain: r.domain as typeof empty.domain,
                    product: r.product,
                    statement: r.statement,
                  });
                }}
              >
                Edit
              </Button>
              <Button variant="ghost" size="sm" onClick={() => void deleteRule({ data: { id: r.id } }).then(reload)}>
                Delete
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
