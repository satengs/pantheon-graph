import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { listStudio, saveConfig } from "@/lib/server/studio-db";
import { DEFAULT_BRAND_CONFIG } from "@/data/rules-seed";

export function ConfigPanel() {
  const [fdr, setFdr] = useState(JSON.stringify(DEFAULT_BRAND_CONFIG.fdr, null, 2));
  const [achieve, setAchieve] = useState(JSON.stringify(DEFAULT_BRAND_CONFIG.achieve, null, 2));
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    void listStudio()
      .then((data) => {
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

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
      <section className="rounded-xl bg-raised p-4 text-sm text-muted">
        <h2 className="font-display text-lg text-fg">Where data lives</h2>
        <p className="mt-2">
          There is no MongoDB in this app. Rules, tasks, brand JSON, and page notes persist in{" "}
          <strong className="text-fg">Postgres</strong> — Neon when deployed, embedded Postgres in this preview.
          Crawl snapshots stay in the versioned JSON catalog. Auth sessions use Better Auth tables in the same database.
        </p>
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
