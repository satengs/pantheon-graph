import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { listStudio, saveConfig } from "@/lib/server/studio-db";
import { DEFAULT_BRAND_CONFIG } from "@/data/rules-seed";

function kb(n: number) {
  if (n < 1024) return `${n} B`;
  return `${(n / 1024).toFixed(1)} KB`;
}

export function ConfigPanel() {
  const [fdr, setFdr] = useState(JSON.stringify(DEFAULT_BRAND_CONFIG.fdr, null, 2));
  const [achieve, setAchieve] = useState(JSON.stringify(DEFAULT_BRAND_CONFIG.achieve, null, 2));
  const [msg, setMsg] = useState<string | null>(null);
  const [store, setStore] = useState<string>("postgres");
  const [catalog, setCatalog] = useState<Array<{ kind: string; bytes: number; rows: number; updated_at: string }>>([]);
  const [counts, setCounts] = useState({ rules: 0, tasks: 0, notes: 0, versions: 0 });
  const [history, setHistory] = useState<
    Array<{ id: string; kind: string; label: string; bytes: number; rows: number; created_at: string }>
  >([]);

  useEffect(() => {
    void listStudio()
      .then((data) => {
        setStore(data.store);
        setCatalog(data.catalog);
        setCounts(data.counts);
        setHistory(data.history);
        for (const c of data.configs) {
          if (c.brand === "fdr") setFdr(c.json);
          if (c.brand === "achieve") setAchieve(c.json);
        }
      })
      .catch((e: unknown) => setMsg(e instanceof Error ? e.message : "Load failed"));
  }, []);

  async function save(brand: "fdr" | "achieve", json: string) {
    setMsg(null);
    try {
      JSON.parse(json);
      await saveConfig({ data: { brand, json } });
      setMsg(`Saved ${brand} JSON`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Invalid JSON");
    }
  }

  const catalogBytes = catalog.reduce((n, c) => n + c.bytes, 0);
  const driver =
    store === "neon" ? "Neon Postgres (this deploy)" : "embedded Postgres in this preview (wiped on restart)";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
      <section className="rounded-xl bg-raised p-4 text-sm text-muted">
        <h2 className="font-display text-lg text-fg">Where the data lives</h2>
        <p className="mt-2">
          Origin does not use MongoDB. The catalog is large on purpose — crawl pages plus 51-state coverage —
          and it is stored in <strong className="text-fg">Postgres</strong>, table <span className="font-mono text-fg">studio_catalog</span>.
          Driver: {driver}.
        </p>
        <dl className="mt-3 grid gap-2 sm:grid-cols-2">
          {catalog.map((c) => (
            <div key={c.kind} className="rounded-lg bg-bg p-3">
              <dt className="text-[10px] uppercase tracking-wide text-subtle">{c.kind}</dt>
              <dd className="mt-1 font-mono text-fg">
                {kb(c.bytes)} · {c.rows.toLocaleString()} rows
              </dd>
            </div>
          ))}
          <div className="rounded-lg bg-bg p-3">
            <dt className="text-[10px] uppercase tracking-wide text-subtle">Rules / tasks / notes</dt>
            <dd className="mt-1 font-mono text-fg">
              {counts.rules} rules · {counts.tasks} tasks · {counts.notes} notes
            </dd>
          </div>
          <div className="rounded-lg bg-bg p-3">
            <dt className="text-[10px] uppercase tracking-wide text-subtle">Catalog total</dt>
            <dd className="mt-1 font-mono text-fg">{kb(catalogBytes)}</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-subtle">
          Auth sessions use Better Auth tables in the same database. JSON files in the repo are the seed snapshot only.
          Live crawl and every rule or brand JSON save appends a new row to <span className="font-mono">studio_history</span> — nothing is overwritten.
        </p>
      </section>
      <section className="rounded-xl bg-raised p-4">
        <h3 className="text-sm font-medium text-fg">History ({counts.versions} recent)</h3>
        {history.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No versions yet. Sign in, then open Config or run Live crawl.</p>
        ) : (
          <ol className="mt-3 space-y-2">
            {history.map((h) => (
              <li key={h.id} className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg bg-bg px-3 py-2 text-sm">
                <span className="text-fg">{h.label}</span>
                <span className="font-mono text-xs text-subtle">
                  {h.kind} · {h.rows.toLocaleString()} rows · {kb(h.bytes)} · {String(h.created_at).slice(0, 19)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
      {msg ? <p className="text-sm text-muted">{msg}</p> : null}
      <BrandJson
        title="Freedom Debt Relief JSON"
        value={fdr}
        onChange={setFdr}
        onSave={() => void save("fdr", fdr)}
      />
      <BrandJson
        title="Achieve JSON"
        value={achieve}
        onChange={setAchieve}
        onSave={() => void save("achieve", achieve)}
      />
    </div>
  );
}

function BrandJson({
  title,
  value,
  onChange,
  onSave,
}: {
  title: string;
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-medium">{title}</h3>
        <Button size="sm" onClick={onSave}>
          Save
        </Button>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        className="min-h-48 w-full rounded-xl bg-bg p-3 font-mono text-xs leading-relaxed text-fg shadow-[var(--shadow-border)]"
      />
    </section>
  );
}
