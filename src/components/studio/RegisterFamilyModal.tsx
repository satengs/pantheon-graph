import { useEffect, useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Globe, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addBrand, attachSystemRules, createParent, listOrgs, probeWebsite } from "@/lib/server/orgs";
import type { OrgProbe } from "@/lib/org/catalog";
import type { GraphOrg } from "@/lib/graph/model";
import {
  BRAND_MAX,
  firstErrorStep,
  hasFamilyErrors,
  parseWebsite,
  usedBrand,
  validateFamilyDraft,
  validateWebsiteField,
  type ExistingOrgHint,
  type FamilyFormErrors,
} from "@/lib/org/family-form";
import { familyContextFrom, useStudio } from "@/store/studio";

type DraftBrand = {
  key: string;
  name: string;
  website: string;
  probe: OrgProbe | null;
};

function emptyBrand(): DraftBrand {
  return { key: crypto.randomUUID(), name: "", website: "", probe: null };
}

function fieldClass(invalid: boolean): string {
  return `h-10 rounded-md bg-bg px-3 text-sm text-fg placeholder:text-subtle ${
    invalid ? "ring-1 ring-danger" : "shadow-[var(--shadow-border)]"
  }`;
}

function FieldNote({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="text-xs text-danger">
      {message}
    </p>
  );
}

export function RegisterFamilyModal() {
  const open = useStudio((s) => s.registerOpen);
  const setOpen = useStudio((s) => s.setRegisterOpen);
  const setTab = useStudio((s) => s.setTab);
  const setGraphOrg = useStudio((s) => s.setGraphOrg);
  const setParentSlug = useStudio((s) => s.setParentSlug);
  const setBrand = useStudio((s) => s.setBrand);
  const bumpFamily = useStudio((s) => s.bumpFamily);
  const applyFamilyContext = useStudio((s) => s.applyFamilyContext);
  const titleId = useId();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [parentName, setParentName] = useState("");
  const [parentUrl, setParentUrl] = useState("");
  const [parentProbe, setParentProbe] = useState<OrgProbe | null>(null);
  const [brands, setBrands] = useState<DraftBrand[]>([emptyBrand(), emptyBrand()]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [attempted, setAttempted] = useState(0);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [extra, setExtra] = useState<Record<string, string>>({});
  const [existing, setExisting] = useState<ExistingOrgHint[]>([]);

  useEffect(() => setReady(true), []);

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setParentName("");
    setParentUrl("");
    setParentProbe(null);
    setBrands([emptyBrand(), emptyBrand()]);
    setBusy(null);
    setErr(null);
    setAttempted(0);
    setTouched({});
    setExtra({});
    void listOrgs()
      .then((d) => {
        const hints: ExistingOrgHint[] = [
          ...d.parents.map((p) => ({ name: p.name, host: p.host, kind: "parent" as const })),
          ...(d.allBrands ?? d.brands).map((b) => ({ name: b.name, host: b.host, kind: "brand" as const })),
        ];
        setExisting(hints);
      })
      .catch(() => setExisting([]));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, busy, setOpen]);

  const errors = useMemo(
    () => validateFamilyDraft({ parentName, parentUrl, brands }, existing),
    [parentName, parentUrl, brands, existing],
  );

  function show(stepOwner: 1 | 2, key: string, message?: string): string | undefined {
    const msg = extra[key] || message;
    if (!msg) return undefined;
    if (touched[key] || extra[key] || attempted >= stepOwner) return msg;
    return undefined;
  }

  const parentNameErr = show(1, "parentName", errors.parentName);
  const parentUrlErr = show(1, "parentUrl", errors.parentUrl);

  function touch(key: string) {
    setTouched((t) => (t[key] ? t : { ...t, [key]: true }));
  }

  function applyGraph(d: {
    parent: { slug: string; name: string; website: string; includeInGraph: boolean } | null;
    brands: Array<{ slug: string; name: string; website: string; products: string[]; probe: OrgProbe }>;
  }) {
    const org: GraphOrg = {
      parent: d.parent ? { slug: d.parent.slug, name: d.parent.name, url: d.parent.website || undefined } : null,
      brands: d.brands.map((b) => ({
        slug: b.slug,
        name: b.name,
        url: b.website,
        products: b.products,
        pageCount: b.probe.pageCount,
      })),
    };
    setGraphOrg(org);
    if (d.parent) setParentSlug(d.parent.slug);
    setBrand("all");
  }

  async function retrieveParent() {
    const fieldErr = validateWebsiteField(parentUrl);
    if (fieldErr) {
      touch("parentUrl");
      setExtra((x) => ({ ...x, parentUrl: fieldErr }));
      setErr(null);
      return;
    }
    setBusy("parent-probe");
    setErr(null);
    try {
      const res = await probeWebsite({ data: { url: parentUrl } });
      if (!res.ok) {
        touch("parentUrl");
        setParentProbe(res.probe);
        setErr(res.probe.error || "Could not retrieve that site");
        return;
      }
      setParentProbe(res.probe);
      setParentUrl(res.website);
      if (!parentName.trim()) setParentName(res.guessedName);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Retrieve failed");
    } finally {
      setBusy(null);
    }
  }

  async function retrieveBrand(key: string, url: string) {
    const fieldErr = validateWebsiteField(url);
    if (fieldErr) {
      const k = `brand:${key}:website`;
      touch(k);
      setExtra((x) => ({ ...x, [k]: fieldErr }));
      return;
    }
    setBusy(`probe:${key}`);
    setErr(null);
    try {
      const res = await probeWebsite({ data: { url } });
      if (!res.ok) {
        touch(`brand:${key}:website`);
        setErr(res.probe.error || "Could not retrieve that site");
        return;
      }
      setBrands((list) =>
        list.map((b) =>
          b.key === key
            ? { ...b, website: res.website, probe: res.probe, name: b.name.trim() ? b.name : res.guessedName }
            : b,
        ),
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Retrieve failed");
    } finally {
      setBusy(null);
    }
  }

  const filledBrands = brands.filter(usedBrand);

  function gate(next: 1 | 2 | 3, atLeast: number, check: (e: FamilyFormErrors) => boolean) {
    setAttempted((n) => Math.max(n, atLeast));
    setErr(null);
    const e = validateFamilyDraft({ parentName, parentUrl, brands }, existing);
    if (check(e)) return false;
    setStep(next);
    return true;
  }

  async function createFamily() {
    const e = validateFamilyDraft({ parentName, parentUrl, brands }, existing);
    setAttempted(3);
    if (hasFamilyErrors(e)) {
      setStep(firstErrorStep(e));
      setErr(e.form ?? "Fix the highlighted fields");
      return;
    }
    setBusy("create");
    setErr(null);
    try {
      const parentSite = parseWebsite(parentUrl);
      let family = await createParent({
        data: {
          name: parentName.trim(),
          website: parentSite.ok && !parentSite.empty ? parentSite.url : undefined,
          includeInGraph: true,
        },
      });
      const parentId = family.parent?.id;
      if (!parentId) throw new Error("Parent was not created");
      for (const b of filledBrands) {
        const site = parseWebsite(b.website);
        if (!site.ok || site.empty) continue;
        family = await addBrand({
          data: {
            parentId,
            name: b.name.trim(),
            website: site.url,
            retrieve: true,
          },
        });
      }
      const done = await attachSystemRules({ data: { parentId } });
      applyFamilyContext(familyContextFrom(done));
      bumpFamily();
      setOpen(false);
      setTab("companies");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not create the family");
    } finally {
      setBusy(null);
    }
  }

  if (!ready || !open) return null;

  const panel = (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-bg/80 p-3 sm:items-center"
      role="presentation"
      onClick={() => {
        if (!busy) setOpen(false);
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[min(92dvh,40rem)] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-surface shadow-[var(--shadow-border)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-subtle">New company family</p>
            <h2 id={titleId} className="font-display text-xl text-fg">
              {step === 1 ? "Parent company" : step === 2 ? "Sub-companies" : "Create"}
            </h2>
          </div>
          <button
            type="button"
            className="inline-flex size-9 items-center justify-center rounded-md text-muted hover:bg-raised hover:text-fg"
            onClick={() => !busy && setOpen(false)}
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        <ol className="flex gap-1 px-4 pt-3 text-[11px] uppercase tracking-wide text-subtle">
          {[
            [1, "Parent"],
            [2, "Brands"],
            [3, "Create"],
          ].map(([n, label]) => (
            <li
              key={n}
              className={`flex-1 rounded-md px-2 py-1.5 text-center ${
                step === n ? "bg-accent text-accent-fg" : Number(n) < step ? "bg-raised text-fg" : "bg-bg"
              }`}
            >
              {n} {label}
            </li>
          ))}
        </ol>

        <form
          className="flex min-h-0 flex-1 flex-col"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (busy) return;
            if (step === 1) {
              gate(2, 1, (er) => Boolean(er.parentName || er.parentUrl));
              return;
            }
            if (step === 2) {
              gate(3, 2, (er) => Boolean(er.form || Object.keys(er.brands).length));
              return;
            }
            void createFamily();
          }}
        >
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            {err ? <p className="mb-3 text-sm text-danger">{err}</p> : null}

            {step === 1 ? (
              <div className="grid gap-3">
                <p className="text-sm text-muted">
                  A holding company wraps the brands — like Pantheon above Freedom Debt Relief and Achieve. A name is
                  enough; a website is optional.
                </p>
                <label className="grid gap-1 text-xs text-muted">
                  Name
                  <input
                    autoFocus
                    name="parentName"
                    autoComplete="organization"
                    value={parentName}
                    onChange={(e) => {
                      setParentName(e.target.value);
                      setExtra((x) => {
                        if (!x.parentName) return x;
                        const { parentName: _, ...rest } = x;
                        return rest;
                      });
                    }}
                    onBlur={() => touch("parentName")}
                    placeholder="Pantheon"
                    aria-invalid={Boolean(parentNameErr)}
                    aria-describedby={parentNameErr ? "parent-name-error" : undefined}
                    className={fieldClass(Boolean(parentNameErr))}
                  />
                  <FieldNote id="parent-name-error" message={parentNameErr} />
                </label>
                <label className="grid gap-1 text-xs text-muted">
                  Website <span className="text-subtle">(optional — retrieve fills the name)</span>
                  <div className="flex gap-2">
                    <input
                      name="parentUrl"
                      inputMode="url"
                      autoComplete="url"
                      value={parentUrl}
                      onChange={(e) => {
                        setParentUrl(e.target.value);
                        setExtra((x) => {
                          if (!x.parentUrl) return x;
                          const { parentUrl: _, ...rest } = x;
                          return rest;
                        });
                      }}
                      onBlur={() => touch("parentUrl")}
                      placeholder="https://"
                      aria-invalid={Boolean(parentUrlErr)}
                      aria-describedby={parentUrlErr ? "parent-url-error" : undefined}
                      className={`${fieldClass(Boolean(parentUrlErr))} min-w-0 flex-1`}
                    />
                    <Button type="button" variant="secondary" disabled={Boolean(busy)} onClick={() => void retrieveParent()}>
                      <Globe className="size-3.5" />
                      {busy === "parent-probe" ? "…" : "Retrieve"}
                    </Button>
                  </div>
                  <FieldNote id="parent-url-error" message={parentUrlErr} />
                </label>
                {parentProbe?.ok ? (
                  <p className="rounded-md bg-bg px-3 py-2 text-xs text-muted">
                    {parentProbe.orgName || parentProbe.title} · {parentProbe.hasJsonLd ? "JSON-LD" : "no schema"}
                    {parentProbe.pageCount ? ` · ${parentProbe.pageCount.toLocaleString()} URLs` : ""}
                  </p>
                ) : null}
              </div>
            ) : null}

            {step === 2 ? (
              <div className="grid gap-3">
                <p className="text-sm text-muted">
                  Add each brand under {parentName.trim() || "the parent"}. Every sub-company needs a website — paste
                  the homepage and Retrieve to fill the name, or type both.
                </p>
                {attempted >= 2 && errors.form ? (
                  <p role="alert" className="text-sm text-danger">
                    {errors.form}
                  </p>
                ) : null}
                {brands.map((b, i) => {
                  const nameErr = show(2, `brand:${b.key}:name`, errors.brands[b.key]?.name);
                  const urlErr = show(2, `brand:${b.key}:website`, errors.brands[b.key]?.website);
                  return (
                    <div key={b.key} className="grid gap-2 rounded-lg bg-bg p-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs uppercase tracking-wide text-subtle">Brand {i + 1}</p>
                        {brands.length > 1 ? (
                          <button
                            type="button"
                            className="inline-flex size-8 items-center justify-center rounded-md text-muted hover:text-danger"
                            onClick={() => setBrands((list) => list.filter((x) => x.key !== b.key))}
                            aria-label="Remove brand"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        ) : null}
                      </div>
                      <input
                        value={b.name}
                        onChange={(e) => {
                          const v = e.target.value;
                          setBrands((list) => list.map((x) => (x.key === b.key ? { ...x, name: v } : x)));
                          setExtra((x) => {
                            const k = `brand:${b.key}:name`;
                            if (!x[k]) return x;
                            const next = { ...x };
                            delete next[k];
                            return next;
                          });
                        }}
                        onBlur={() => touch(`brand:${b.key}:name`)}
                        placeholder="Brand name"
                        aria-invalid={Boolean(nameErr)}
                        aria-describedby={nameErr ? `brand-${b.key}-name-error` : undefined}
                        className={`${fieldClass(Boolean(nameErr))} bg-surface`}
                      />
                      <FieldNote id={`brand-${b.key}-name-error`} message={nameErr} />
                      <div className="flex gap-2">
                        <input
                          value={b.website}
                          inputMode="url"
                          onChange={(e) => {
                            const v = e.target.value;
                            setBrands((list) => list.map((x) => (x.key === b.key ? { ...x, website: v } : x)));
                            setExtra((x) => {
                              const k = `brand:${b.key}:website`;
                              if (!x[k]) return x;
                              const next = { ...x };
                              delete next[k];
                              return next;
                            });
                          }}
                          onBlur={() => touch(`brand:${b.key}:website`)}
                          placeholder="https://www.example.com"
                          aria-invalid={Boolean(urlErr)}
                          aria-describedby={urlErr ? `brand-${b.key}-url-error` : undefined}
                          className={`${fieldClass(Boolean(urlErr))} min-w-0 flex-1 bg-surface`}
                        />
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={Boolean(busy)}
                          onClick={() => void retrieveBrand(b.key, b.website)}
                        >
                          {busy === `probe:${b.key}` ? "…" : "Retrieve"}
                        </Button>
                      </div>
                      <FieldNote id={`brand-${b.key}-url-error`} message={urlErr} />
                      {b.probe?.ok ? (
                        <p className="text-xs text-muted">
                          {(b.probe.pageCount ?? 0).toLocaleString()} pages
                          {b.probe.products?.length ? ` · ${b.probe.products.join(", ")}` : ""}
                          {b.probe.hasJsonLd ? " · JSON-LD" : " · no JSON-LD"}
                        </p>
                      ) : null}
                    </div>
                  );
                })}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={brands.length >= BRAND_MAX}
                  onClick={() => setBrands((list) => (list.length >= BRAND_MAX ? list : [...list, emptyBrand()]))}
                >
                  <Plus className="size-3.5" />
                  Another brand
                </Button>
              </div>
            ) : null}

            {step === 3 ? (
              <div className="grid gap-3 text-sm">
                <p className="text-muted">
                  This family gets the default system rules (schema, canonical, JSON-LD, article semantics).
                </p>
                <div className="rounded-lg bg-bg p-3">
                  <p className="text-[10px] uppercase tracking-wide text-subtle">Parent</p>
                  <p className="font-display text-lg text-fg">{parentName.trim()}</p>
                  {parentUrl.trim() ? <p className="font-mono text-xs text-subtle">{parentUrl.trim()}</p> : null}
                </div>
                <ul className="grid gap-2">
                  {filledBrands.map((b) => (
                    <li key={b.key} className="rounded-lg bg-bg p-3">
                      <p className="text-fg">{b.name.trim()}</p>
                      <p className="font-mono text-xs text-subtle">{b.website.trim()}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap justify-between gap-2 border-t border-border px-4 py-3">
            <Button
              type="button"
              variant="ghost"
              disabled={Boolean(busy) || step === 1}
              onClick={() => setStep((s) => (s === 3 ? 2 : 1))}
            >
              Back
            </Button>
            {step < 3 ? (
              <Button type="submit" disabled={Boolean(busy)}>
                Continue
              </Button>
            ) : (
              <Button type="submit" disabled={Boolean(busy)}>
                {busy === "create" ? "Creating…" : "Create family"}
              </Button>
            )}
          </div>
        </form>
      </div>
    </div>
  );

  return createPortal(panel, document.body);
}
