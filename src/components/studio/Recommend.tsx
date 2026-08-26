import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useStudio } from "@/store/studio";
import {
  AI_WINS,
  CATEGORIES,
  IDEAL_TREE,
  RECS,
  SERP_WINS,
  type RecCategory,
} from "@/data/recommend";

const CAT_ORDER: RecCategory[] = ["identity", "ownership", "wrong-shelf", "same-page", "ai-recipe"];

export function Recommend() {
  const selectIssue = useStudio((s) => s.selectIssue);
  const selectedIssueId = useStudio((s) => s.selectedIssueId);

  return (
    <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
      <header className="mb-6 max-w-4xl">
        <p className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.18em] text-subtle">
          <Sparkles className="size-3.5" /> Recommendation
        </p>
        <h1 className="mt-1 font-display text-3xl tracking-tight">
          Two brands, one company — without confusing search or AI
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-muted">
          Freedom Debt Relief and Achieve sell related help, not the same product. FDR owns relief, Achieve owns
          lending, the parent is named once. Everything in this tab is what that split wins in Google and in AI
          answers.
        </p>
      </header>

      <section className="mb-8 rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">Ideal graph</h2>
          <Badge tone="ok">target</Badge>
        </div>
        <p className="mt-1 text-xs text-muted">
          Parent named once. Brands do not sell each other’s products. Glossary is split by who actually offers it.
        </p>
        <div className="mt-4 flex flex-col items-center">
          <div className="rounded-lg bg-raised px-4 py-2 text-center text-xs font-medium">{IDEAL_TREE.parent}</div>
          <div className="h-6 w-px bg-border" />
          <div className="flex w-full gap-3">
            {IDEAL_TREE.brands.map((b) => (
              <div key={b.id} className="min-w-0 flex-1 rounded-lg bg-raised p-3">
                <p className={`text-sm font-medium ${b.id === "fdr" ? "text-fdr" : "text-achieve"}`}>{b.name}</p>
                <p className="text-[11px] text-muted">{b.role}</p>
                <ul className="mt-2 space-y-1">
                  {b.products.map((p) => (
                    <li key={p} className="rounded-md bg-surface px-2 py-1 text-[11px] text-fg">
                      {p}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[10px] uppercase tracking-wide text-subtle">Glossary owns</p>
                <p className="text-[11px] text-muted">{b.glossary}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mb-8 grid gap-3 md:grid-cols-2">
        <WinColumn title="In Google (SERP)" items={SERP_WINS} />
        <WinColumn title="In AI Overviews, ChatGPT, Perplexity" items={AI_WINS} />
      </section>

      <section className="mb-4">
        <h2 className="font-display text-xl">Weak points, grouped for a roadmap</h2>
        <p className="mt-1 text-sm text-muted">
          Click a code to open the proof. Staff in order: identity, ownership, wrong-shelf URLs, on-page splits, then
          the recipe AI copies.
        </p>
      </section>

      {CAT_ORDER.map((cat) => (
        <section key={cat} className="mb-6">
          <div className="mb-2 flex items-baseline gap-2">
            <span className="size-2 rounded-full" style={{ background: CATEGORIES[cat].color }} />
            <h3 className="text-sm font-medium">{CATEGORIES[cat].label}</h3>
            <p className="text-xs text-muted">{CATEGORIES[cat].blurb}</p>
          </div>
          <div className="grid gap-3">
            {RECS.filter((r) => r.category === cat).map((r) => (
              <article key={r.title} className="rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]">
                <div className="flex flex-wrap items-center gap-1.5">
                  {r.codes.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => selectIssue(c)}
                      className={`rounded-md px-2 py-0.5 font-mono text-[11px] ${
                        selectedIssueId === c ? "bg-accent text-accent-fg" : "bg-raised text-fg"
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                  <h4 className="ml-1 text-sm font-medium text-fg">{r.title}</h4>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <Fact k="Today" v={r.today} />
                  <Fact k="Why it hurts" v={r.hurt} />
                  <Fact k="The fix" v={r.fix} />
                  <div className="space-y-2">
                    <Fact k="SERP" v={r.serp} />
                    <Fact k="AI" v={r.ai} />
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <p className="text-xs leading-relaxed text-muted">
      <span className="block text-[10px] uppercase tracking-wide text-subtle">{k}</span>
      {v}
    </p>
  );
}

function WinColumn({ title, items }: { title: string; items: { label: string; detail: string }[] }) {
  return (
    <div className="rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]">
      <h2 className="text-sm font-medium">{title}</h2>
      <ul className="mt-3 space-y-2">
        {items.map((w) => (
          <li key={w.label} className="text-xs text-muted">
            <span className="font-medium text-fg">{w.label}.</span> {w.detail}
          </li>
        ))}
      </ul>
    </div>
  );
}
