import { useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  FDR_LABEL,
  OFFER_LABEL,
  SERVICE_CATALOG,
  US_LAYOUT,
  statesData,
  statusTone,
  type OfferStatus,
  type StateRow,
} from "@/data/states";
import { useStudio } from "@/store/studio";

type CoverageFilter =
  | "all"
  | "settlement"
  | "near-me"
  | "heloc"
  | "personal-loan"
  | "debt-relief"
  | "collections";

const FILTERS: { id: CoverageFilter; label: string }[] = [
  { id: "all", label: "All services" },
  { id: "settlement", label: "FDR settlement" },
  { id: "near-me", label: "FDR near-me" },
  { id: "heloc", label: "Achieve HELOC / HEL" },
  { id: "personal-loan", label: "Achieve personal loan" },
  { id: "debt-relief", label: "Achieve debt relief" },
  { id: "collections", label: "Achieve collections" },
];

function chipClass(active: boolean, covered: "full" | "partial" | "none") {
  if (active) return "bg-accent text-accent-fg";
  if (covered === "full") return "bg-ok/20 text-ok";
  if (covered === "partial") return "bg-warn/20 text-warn";
  return "bg-bg text-subtle";
}

function coverage(row: StateRow, filter: CoverageFilter): "full" | "partial" | "none" {
  if (filter === "settlement") {
    if (row.fdrSettlement === "direct") return "full";
    if (row.fdrSettlement === "partner") return "partial";
    return "none";
  }
  if (filter === "near-me") return row.fdrNearMe || row.fdrCityPages > 0 ? "full" : "none";
  if (filter === "heloc") {
    if (row.achieveHeloc === "offered") return "full";
    if (row.achieveHeloc === "licensed") return "partial";
    return "none";
  }
  if (filter === "personal-loan") {
    if (row.achievePersonalLoan === "offered") return "full";
    if (row.achievePersonalLoan === "licensed") return "partial";
    return "none";
  }
  if (filter === "debt-relief") {
    if (row.achieveDebtRelief === "direct") return "full";
    if (row.achieveDebtRelief === "partner") return "partial";
    return "none";
  }
  if (filter === "collections") return row.achieveCollections ? "full" : "none";
  const live =
    row.fdrSettlement !== "none" ||
    row.achieveHeloc === "offered" ||
    row.achievePersonalLoan === "offered";
  const gated =
    row.fdrSettlement === "partner" ||
    row.achieveHeloc === "licensed" ||
    row.achievePersonalLoan === "licensed";
  if (live) return "full";
  if (gated || row.fdrNearMe || row.achieveCollections) return "partial";
  return "none";
}

function offerTone(v: OfferStatus): "ok" | "warn" | "neutral" {
  if (v === "offered") return "ok";
  if (v === "licensed") return "warn";
  return "neutral";
}

export function StatesPanel() {
  const brand = useStudio((s) => s.brand);
  const product = useStudio((s) => s.product);
  const query = useStudio((s) => s.query);
  const selectedState = useStudio((s) => s.selectedState);
  const selectState = useStudio((s) => s.selectState);
  const [filter, setFilter] = useState<CoverageFilter>("all");

  const rows = useMemo(() => {
    return statesData.states.filter((s) => {
      if (query.trim()) {
        const q = query.toLowerCase();
        if (!`${s.code} ${s.name}`.toLowerCase().includes(q)) return false;
      }
      if (product === "settlement" || product === "debt-relief") {
        if (brand === "fdr" && s.fdrSettlement === "none") return false;
        if (brand === "achieve" && s.achieveDebtRelief === "none") return false;
      }
      if (product === "heloc" || product === "hel") {
        if (brand !== "fdr" && s.achieveHeloc === "none") return false;
      }
      if (product === "personal-loan") {
        if (brand !== "fdr" && s.achievePersonalLoan === "none") return false;
      }
      if (product === "consolidation" && brand !== "achieve" && !s.fdrNearMe) return false;
      if (filter !== "all" && coverage(s, filter) === "none") return false;
      return true;
    });
  }, [brand, product, query, filter]);

  const fdrDirect = statesData.states.filter((s) => s.fdrSettlement === "direct").length;
  const fdrPartner = statesData.states.filter((s) => s.fdrSettlement === "partner").length;
  const fdrNone = statesData.states.filter((s) => s.fdrSettlement === "none").length;
  const fdrNear = statesData.states.filter((s) => s.fdrNearMe).length;
  const achHeloc = statesData.states.filter((s) => s.achieveHeloc === "offered").length;
  const achHelocLic = statesData.states.filter((s) => s.achieveHeloc === "licensed").length;
  const achPl = statesData.states.filter((s) => s.achievePersonalLoan === "offered").length;
  const achPlLic = statesData.states.filter((s) => s.achievePersonalLoan === "licensed").length;
  const achCol = statesData.states.filter((s) => s.achieveCollections).length;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="grid gap-2 border-b border-border p-3 lg:grid-cols-3">
        <BrandCard
          brand="Freedom Debt Relief"
          tone="fdr"
          lines={[
            `Debt settlement — ${fdrDirect} direct, ${fdrPartner} via legal partner, ${fdrNone} not offered`,
            `Local near-me landings — ${fdrNear} state pages`,
            "No HELOC, home equity, or personal loans",
          ]}
        />
        <BrandCard
          brand="Achieve"
          tone="achieve"
          lines={[
            `HELOC / home equity — ${achHeloc} offered, ${achHelocLic} licensed but gated`,
            `Personal loans — ${achPl} offered, ${achPlLic} licensed but gated`,
            `Debt relief follows FDR · collections licensed in ${achCol} states`,
          ]}
        />
        <div className="rounded-xl bg-raised p-3 text-xs leading-relaxed text-muted">
          Identified from live{" "}
          <a className="text-fdr hover:underline" href={statesData.source.fdrFacts} target="_blank" rel="noreferrer">
            FDR facts
          </a>
          ,{" "}
          <a className="text-fdr hover:underline" href={statesData.source.fdrNearMe} target="_blank" rel="noreferrer">
            near-me sitemap
          </a>
          , and{" "}
          <a
            className="text-achieve hover:underline"
            href={statesData.source.achieveLicenses}
            target="_blank"
            rel="noreferrer"
          >
            Achieve licenses
          </a>{" "}
          (NMLS 138464 / 1810501 / 227977). License is not a guarantee the product is currently offered.
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 border-b border-border px-3 py-2">
        {FILTERS.map((f) => {
          const on = filter === f.id;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`h-8 rounded-md px-2.5 text-xs transition-colors duration-[var(--motion-quick)] ${
                on ? "bg-accent text-accent-fg" : "bg-raised text-muted hover:text-fg"
              }`}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      <div className="min-w-0 overflow-x-auto border-b border-border p-3">
        <div className="mx-auto grid w-max grid-cols-11 gap-0.5 sm:gap-1">
          {US_LAYOUT.flatMap((row, ri) =>
            row.map((code, ci) => {
              if (!code) {
                return <span key={`${ri}-${ci}`} className="size-7 sm:size-8" />;
              }
              const state = statesData.states.find((s) => s.code === code)!;
              const on = selectedState === code;
              const cov = coverage(state, filter);
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => selectState(code)}
                  title={state.name}
                  className={`size-7 rounded-sm font-mono text-[11px] transition-colors duration-[var(--motion-quick)] sm:size-8 ${chipClass(on, cov)}`}
                >
                  {code}
                </button>
              );
            }),
          )}
        </div>
        <p className="mt-2 text-center text-[10px] uppercase tracking-wide text-subtle">
          {filter === "all" ? "Any live service" : FILTERS.find((f) => f.id === filter)?.label} · green offered · amber
          partner / licensed · click a state
        </p>
      </div>

      <div className="min-h-0 min-w-0 flex-1 overflow-auto">
        <table className="w-full min-w-[920px] border-collapse text-left text-sm">
          <thead className="sticky top-0 bg-surface text-[10px] uppercase tracking-wide text-subtle">
            <tr>
              <th className="px-3 py-2 font-medium">State</th>
              <th className="px-2 py-2 font-medium">FDR settlement</th>
              <th className="px-2 py-2 font-medium">FDR local pages</th>
              <th className="px-2 py-2 font-medium">Achieve HELOC / HEL</th>
              <th className="px-2 py-2 font-medium">Achieve personal loan</th>
              <th className="px-2 py-2 font-medium">Achieve debt relief</th>
              <th className="px-2 py-2 font-medium">Collections</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr
                key={s.code}
                onClick={() => selectState(s.code)}
                className={`cursor-pointer border-t border-border/80 hover:bg-raised/70 ${
                  selectedState === s.code ? "bg-raised" : ""
                }`}
              >
                <td className="px-3 py-2">
                  <span className="font-mono text-xs text-subtle">{s.code}</span>{" "}
                  <span className="text-fg">{s.name}</span>
                </td>
                <td className="px-2 py-2">
                  <Badge tone={statusTone(s.fdrSettlement)}>{FDR_LABEL[s.fdrSettlement]}</Badge>
                </td>
                <td className="px-2 py-2">
                  {s.fdrUrl ? (
                    <a
                      href={s.fdrUrl}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 text-fdr hover:underline"
                    >
                      {s.fdrCityPages ? `${s.fdrCityPages} cities` : "State page"}
                      <ExternalLink className="size-3.5" />
                    </a>
                  ) : s.fdrCityPages ? (
                    <span className="text-muted">{s.fdrCityPages} city pages</span>
                  ) : (
                    <span className="text-subtle">—</span>
                  )}
                </td>
                <td className="px-2 py-2">
                  <Badge tone={offerTone(s.achieveHeloc)}>{OFFER_LABEL[s.achieveHeloc]}</Badge>
                </td>
                <td className="px-2 py-2">
                  <Badge tone={offerTone(s.achievePersonalLoan)}>{OFFER_LABEL[s.achievePersonalLoan]}</Badge>
                </td>
                <td className="px-2 py-2">
                  <Badge tone={statusTone(s.achieveDebtRelief)}>{FDR_LABEL[s.achieveDebtRelief]}</Badge>
                </td>
                <td className="px-2 py-2">
                  <Badge tone={s.achieveCollections ? "ok" : "neutral"}>
                    {s.achieveCollections ? "Licensed" : "—"}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BrandCard({
  brand,
  tone,
  lines,
}: {
  brand: string;
  tone: "fdr" | "achieve";
  lines: string[];
}) {
  const owned = SERVICE_CATALOG.filter((s) => (tone === "fdr" ? s.brand === "fdr" : s.brand === "achieve"));
  return (
    <div className="rounded-xl bg-raised p-3">
      <Badge tone={tone}>{brand}</Badge>
      <ul className="mt-2 flex flex-wrap gap-1">
        {owned.map((s) => (
          <li key={s.id}>
            <span className="inline-flex h-5 items-center rounded-sm bg-bg px-1.5 text-[10px] uppercase tracking-wide text-muted">
              {s.label}
            </span>
          </li>
        ))}
      </ul>
      <ul className="mt-2 space-y-0.5 text-sm text-muted">
        {lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
    </div>
  );
}