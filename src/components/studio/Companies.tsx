import { useEffect, useState } from "react";
import { Building2, Link2, RefreshCw, Shield } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { attachBrandRules, attachSystemRules, listOrgs, retrieveBrand, setBrandProducts, setIncludeParent } from "@/lib/server/orgs";
import type { CoverageItem, StudioOrg } from "@/lib/org/catalog";
import { PRODUCT_MAX_PER_BRAND, SEED_BRAND_SLUGS, SEED_PARENT, slugProduct, validateProductName } from "@/lib/org/catalog";
import { familyContextFrom, useStudio } from "@/store/studio";
import { runValidation } from "@/lib/server/validate-run";
import { productLabel, PRODUCT_LABEL } from "@/lib/graph/types";

type Family = {
  parents: StudioOrg[];
  parent: StudioOrg | null;
  brands: StudioOrg[];
  allBrands?: StudioOrg[];
  coverage: CoverageItem[];
  missing: Array<{ code: string; title: string; why: string }>;
  systemCodes: string[];
  ruleCodes?: string[];
};

const emptyFamily: Family = {
  parents: [],
  parent: null,
  brands: [],
  coverage: [],
  missing: [],
  systemCodes: [],
};

function toneOf(status: CoverageItem["status"]): "ok" | "warn" | "danger" | "neutral" {
  if (status === "ok") return "ok";
  if (status === "warn") return "warn";
  if (status === "miss") return "danger";
  return "neutral";
}

export function Companies() {
  const applyFamilyContext = useStudio((s) => s.applyFamilyContext);
  const includeParent = useStudio((s) => s.includeParent);
  const setIncludeParentStore = useStudio((s) => s.setIncludeParent);
  const setTab = useStudio((s) => s.setTab);
  const brandFilter = useStudio((s) => s.brand);
  const setBrand = useStudio((s) => s.setBrand);
  const familyEpoch = useStudio((s) => s.familyEpoch);
  const parentId = useStudio((s) => s.parentId);
  const selectIssue = useStudio((s) => s.selectIssue);

  const [family, setFamily] = useState<Family>(emptyFamily);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [productDraft, setProductDraft] = useState<Record<string, string>>({});

  function applyFamily(data: Family) {
    setFamily(data);
    applyFamilyContext(familyContextFrom(data));
  }

  async function reload() {
    try {
      const data = await listOrgs({ data: parentId ? { parentId } : undefined });
      applyFamily(data);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load companies");
    }
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familyEpoch, parentId]);

  const parent = family.parent;
  const seedFamily = parent?.slug === SEED_PARENT.slug || family.brands.some((b) => SEED_BRAND_SLUGS.has(b.slug));
  const systemMissing = family.missing.filter((m) => family.systemCodes.includes(m.code));
  const brandMissing = seedFamily ? family.missing.filter((m) => !family.systemCodes.includes(m.code)) : [];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-subtle">Company family</p>
          <h2 className="font-display text-2xl text-fg">{parent?.name ?? "No parent selected"}</h2>
          <p className="mt-1 max-w-xl text-sm text-muted">
            {parent?.name ?? "This family"} holds the brands below. Use New family in the header to register another parent
            with its own sub-companies.
          </p>
        </div>
        {parent ? (
          <label className="flex h-10 items-center gap-2 rounded-md bg-surface px-3 text-sm text-muted shadow-[var(--shadow-border)]">
            <input
              type="checkbox"
              checked={includeParent}
              onChange={(e) => {
                const on = e.target.checked;
                setIncludeParentStore(on);
                void setIncludeParent({ data: { parentId: parent.id, include: on } }).then(applyFamily);
              }}
              className="size-4 accent-[var(--color-accent)]"
            />
            Show parent in graph
          </label>
        ) : null}
      </header>

      {err ? <p className="text-sm text-danger">{err}</p> : null}
      {msg ? <p className="text-sm text-ok">{msg}</p> : null}

      <section className="rounded-xl bg-raised p-4">
        <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-wide text-subtle">
          <Building2 className="size-3.5" /> Structure
        </div>
        <div className="flex flex-col items-stretch gap-3">
          <div className="rounded-lg bg-bg px-4 py-3 shadow-[var(--shadow-border)]">
            <p className="text-[10px] uppercase tracking-wide text-subtle">Parent</p>
            <p className="font-display text-xl text-fg">{parent?.name ?? "—"}</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {family.brands.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => setBrand(b.slug)}
                className={`rounded-lg bg-bg p-3 text-left shadow-[var(--shadow-border)] ${
                  brandFilter === b.slug ? "ring-1 ring-accent" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-fg">{b.name}</p>
                  <Badge tone={b.slug === "fdr" ? "fdr" : b.slug === "achieve" ? "achieve" : "neutral"}>
                    {b.slug}
                  </Badge>
                </div>
                <p className="mt-1 truncate font-mono text-[11px] text-subtle">{b.host || b.website || "No URL"}</p>
                <p className="mt-1 text-xs text-muted">
                  {(b.probe.pageCount ?? 0).toLocaleString()} pages
                  {b.products.length ? ` · ${b.products.map((p) => productLabel(p)).slice(0, 4).join(", ")}` : " · no products yet"}
                </p>
                {b.website ? (
                  <span
                    role="link"
                    className="mt-2 inline-flex items-center gap-1 text-xs text-muted hover:text-fg"
                    onClick={(e) => {
                      e.stopPropagation();
                      setBusy(`retrieve:${b.id}`);
                      void retrieveBrand({ data: { id: b.id } })
                        .then((d) => {
                          applyFamily(d);
                          setMsg(`Retrieved ${b.name}`);
                        })
                        .catch((er) => setErr(er instanceof Error ? er.message : "Retrieve failed"))
                        .finally(() => setBusy(null));
                    }}
                  >
                    <RefreshCw className={`size-3 ${busy === `retrieve:${b.id}` ? "animate-spin" : ""}`} />
                    {busy === `retrieve:${b.id}` ? "Retrieving…" : "Refresh from site"}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-xl bg-raised p-4">
        <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wide text-subtle">
          <Building2 className="size-3.5" /> Products per brand
        </div>
        <p className="mb-3 text-sm text-muted">
          Each sub-company has its own product list. The Product filter at the top only shows products on this family
          {brandFilter !== "all" ? ` — currently ${family.brands.find((b) => b.slug === brandFilter)?.name ?? brandFilter}` : ""}.
          Retrieve can detect some; add the rest by name.
        </p>
        <div className="grid gap-3">
          {family.brands.map((b) => {
            const draft = productDraft[b.id] ?? "";
            const errMsg = draft.trim() ? validateProductName(draft) : undefined;
            return (
              <div key={b.id} className="rounded-lg bg-bg p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="font-medium text-fg">{b.name}</p>
                  <span className="text-xs text-subtle">
                    {b.products.length}/{PRODUCT_MAX_PER_BRAND}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {b.products.length === 0 ? (
                    <p className="text-xs text-muted">No products yet for this brand.</p>
                  ) : (
                    b.products.map((p) => (
                      <button
                        key={p}
                        type="button"
                        title={`Remove ${productLabel(p)}`}
                        className="inline-flex h-7 items-center gap-1 rounded-md bg-raised px-2 text-xs text-fg"
                        onClick={() => {
                          setBusy(`prod:${b.id}`);
                          void setBrandProducts({ data: { brandId: b.id, products: b.products.filter((x) => x !== p) } })
                            .then((d) => {
                              applyFamily(d);
                              setMsg(`Removed ${productLabel(p)} from ${b.name}`);
                            })
                            .catch((er) => setErr(er instanceof Error ? er.message : "Could not update products"))
                            .finally(() => setBusy(null));
                        }}
                      >
                        {productLabel(p)}
                        <span className="text-subtle">×</span>
                      </button>
                    ))
                  )}
                </div>
                <form
                  className="mt-2 flex flex-wrap items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const nameErr = validateProductName(draft);
                    if (nameErr) {
                      setErr(nameErr);
                      return;
                    }
                    const slug = slugProduct(draft);
                    if (b.products.includes(slug)) {
                      setErr(`${productLabel(slug)} is already on ${b.name}`);
                      return;
                    }
                    setBusy(`prod:${b.id}`);
                    setErr(null);
                    void setBrandProducts({ data: { brandId: b.id, products: [...b.products, slug] } })
                      .then((d) => {
                        applyFamily(d);
                        setProductDraft((m) => ({ ...m, [b.id]: "" }));
                        setMsg(`Added ${productLabel(slug)} to ${b.name}`);
                      })
                      .catch((er) => setErr(er instanceof Error ? er.message : "Could not add product"))
                      .finally(() => setBusy(null));
                  }}
                >
                  <input
                    value={draft}
                    list={`products-${b.id}`}
                    placeholder="Add a product"
                    onChange={(e) => setProductDraft((m) => ({ ...m, [b.id]: e.target.value }))}
                    className="h-9 min-w-[160px] flex-1 rounded-md bg-surface px-3 text-sm shadow-[var(--shadow-border)]"
                  />
                  <datalist id={`products-${b.id}`}>
                    {(seedFamily ? Object.keys(PRODUCT_LABEL) : []).filter((p) => !b.products.includes(p)).map((p) => (
                      <option key={p} value={p}>
                        {productLabel(p)}
                      </option>
                    ))}
                  </datalist>
                  <Button size="sm" type="submit" disabled={busy === `prod:${b.id}` || !draft.trim() || Boolean(errMsg)}>
                    {busy === `prod:${b.id}` ? "Saving…" : "Add"}
                  </Button>
                </form>
                {errMsg ? <p className="mt-1 text-xs text-danger">{errMsg}</p> : null}
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-xl bg-raised p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-subtle">
            <Shield className="size-3.5" /> Coverage vs FDR × Achieve setup
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={busy === "rules" || !parent}
              onClick={() => {
                if (!parent) return;
                setBusy("rules");
                void attachSystemRules({ data: { parentId: parent.id } })
                  .then((d) => {
                    applyFamily(d);
                    setMsg(d.added ? `Attached ${d.added} default system rules` : "Default system rules already on");
                  })
                  .catch((er) => setErr(er instanceof Error ? er.message : "Could not attach rules"))
                  .finally(() => setBusy(null));
              }}
            >
              Attach default rules
            </Button>
            <Button
              size="sm"
              disabled={busy === "check" || !parent}
              onClick={() => {
                if (!parent) return;
                setBusy("check");
                void runValidation({
                  data: {
                    scope: seedFamily ? "common" : "system",
                    brand: brandFilter === "all" ? "all" : brandFilter,
                    live: false,
                    limit: 12,
                    parentId: parent.id,
                  },
                })
                  .then((res) => {
                    setMsg(`Rechecked ${res.pages} pages · ${res.fail} issues`);
                    setTab(seedFamily ? "validation" : "issues");
                  })
                  .catch((er) => setErr(er instanceof Error ? er.message : "Check failed"))
                  .finally(() => setBusy(null));
              }}
            >
              {busy === "check" ? "Checking…" : "Run recheck"}
            </Button>
          </div>
        </div>
        <ul className="grid gap-2 md:grid-cols-2">
          {family.coverage.map((c) => (
            <li key={c.id} className="rounded-lg bg-bg p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm text-fg">{c.label}</p>
                <Badge tone={toneOf(c.status)}>{c.status === "ok" ? "ready" : c.status === "warn" ? "partial" : "missing"}</Badge>
              </div>
              <p className="mt-1 text-xs text-muted">{c.detail}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl bg-raised p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-subtle">
            <Link2 className="size-3.5" /> Brand-specific rules
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setTab("rules");
            }}
          >
            Write a brand rule
          </Button>
        </div>
        <p className="mb-3 text-sm text-muted">
          System rules (schema, canonical, JSON-LD) are shared. Brand rules stay on this family only — we don't suggest
          another company's product, tone, or ownership checks.
        </p>
        {systemMissing.length ? (
          <div className="mb-4">
            <p className="text-xs uppercase tracking-wide text-warn">Default system list — not attached</p>
            <ul className="mt-2 space-y-1 text-sm">
              {systemMissing.map((m) => (
                <li key={m.code}>
                  <span className="font-mono text-xs">{m.code}</span> {m.title}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="mb-4 text-sm text-ok">Default system rules are attached.</p>
        )}
        {seedFamily ? (
          brandMissing.length === 0 ? (
          <p className="text-sm text-ok">
            Brand-specific seed rules are on this family. Write another on the Rules tab if this origin needs a new one.
          </p>
        ) : (
          <div className="grid gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-fg">
                {brandMissing.length} seed rules not on this family
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!parent || busy === "brand-rules" || picked.length === 0}
                  onClick={() => {
                    if (!parent || !picked.length) return;
                    setBusy("brand-rules");
                    void attachBrandRules({ data: { parentId: parent.id, codes: picked } })
                      .then((d) => {
                        applyFamily(d);
                        setPicked([]);
                        setMsg(`Added ${d.added} brand rule${d.added === 1 ? "" : "s"}`);
                        if (picked[0]) selectIssue(picked[0]);
                      })
                      .catch((er) => setErr(er instanceof Error ? er.message : "Could not add rules"))
                      .finally(() => setBusy(null));
                  }}
                >
                  {busy === "brand-rules" ? "Adding…" : `Add selected (${picked.length})`}
                </Button>
                <Button
                  size="sm"
                  disabled={!parent || busy === "brand-rules"}
                  onClick={() => {
                    if (!parent) return;
                    const codes = brandMissing.map((m) => m.code);
                    setBusy("brand-rules");
                    void attachBrandRules({ data: { parentId: parent.id, codes } })
                      .then((d) => {
                        applyFamily(d);
                        setPicked([]);
                        setMsg(`Added ${d.added} brand rules`);
                      })
                      .catch((er) => setErr(er instanceof Error ? er.message : "Could not add rules"))
                      .finally(() => setBusy(null));
                  }}
                >
                  Add all
                </Button>
              </div>
            </div>
            <ul className="max-h-72 space-y-1 overflow-y-auto">
              {brandMissing.map((m) => {
                const on = picked.includes(m.code);
                return (
                  <li key={m.code} className="flex items-start gap-2 rounded-lg bg-bg p-2">
                    <input
                      type="checkbox"
                      className="mt-1 size-4 accent-[var(--color-accent)]"
                      checked={on}
                      onChange={() =>
                        setPicked((list) => (on ? list.filter((c) => c !== m.code) : [...list, m.code]))
                      }
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-fg">
                        <span className="font-mono text-xs">{m.code}</span> {m.title}
                      </p>
                      <p className="text-xs text-subtle">{m.why}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!parent || busy === "brand-rules"}
                      onClick={() => {
                        if (!parent) return;
                        setBusy("brand-rules");
                        void attachBrandRules({ data: { parentId: parent.id, codes: [m.code] } })
                          .then((d) => {
                            applyFamily(d);
                            setPicked((list) => list.filter((c) => c !== m.code));
                            setMsg(`Added ${m.code}`);
                            selectIssue(m.code);
                          })
                          .catch((er) => setErr(er instanceof Error ? er.message : "Could not add rule"))
                          .finally(() => setBusy(null));
                      }}
                    >
                      Add
                    </Button>
                  </li>
                );
              })}
            </ul>
          </div>
          )
        ) : (
          <p className="text-sm text-muted">
            This family only sees its own brand rules. Write them on the Rules tab — we don't copy another company's
            product, tone, or ownership checks.
          </p>
        )}
      </section>
    </div>
  );
}
