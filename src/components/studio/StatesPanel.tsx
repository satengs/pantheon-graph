import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { FDR_LABEL, statesData, type StateRow } from "@/data/states";
import { useStudio } from "@/store/studio";

function fdrTone(v: StateRow["fdrSettlement"]): "ok" | "warn" | "neutral" {
  if (v === "direct") return "ok";
  if (v === "partner") return "warn";
  return "neutral";
}

export function StatesPanel() {
  const brand = useStudio((s) => s.brand);
  const product = useStudio((s) => s.product);
  const query = useStudio((s) => s.query);
  const selectedState = useStudio((s) => s.selectedState);
  const selectState = useStudio((s) => s.selectState);

  const rows = statesData.states.filter((s) => {
    if (query.trim()) {
      const q = query.toLowerCase();
      if (!`${s.code} ${s.name}`.toLowerCase().includes(q)) return false;
    }
    if (product === "settlement" || product === "debt-relief") {
      if (brand === "fdr" && s.fdrSettlement === "none") return false;
      if (brand === "achieve" && s.achieveDebtRelief === "none") return false;
    }
    if (product === "heloc" || product === "hel") {
      if (brand !== "fdr" && !s.achieveMortgage) return false;
    }
    if (product === "personal-loan") {
      if (brand !== "fdr" && s.achievePersonalLoan === "none") return false;
    }
    if (product === "consolidation" && brand !== "achieve" && !s.fdrNearMe) return false;
    return true;
  });

  const fdrDirect = statesData.states.filter((s) => s.fdrSettlement === "direct").length;
  const fdrPartner = statesData.states.filter((s) => s.fdrSettlement === "partner").length;
  const fdrNone = statesData.states.filter((s) => s.fdrSettlement === "none").length;
  const achMort = statesData.states.filter((s) => s.achieveMortgage).length;
  const achPl = statesData.states.filter((s) => s.achievePersonalLoan === "offered").length;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid gap-2 border-b border-border p-3 sm:grid-cols-3">
        <Summary
          brand="FDR"
          tone="fdr"
          lines={[
            `${fdrDirect} direct settlement`,
            `${fdrPartner} via legal partner`,
            `${fdrNone} not offered`,
          ]}
        />
        <Summary
          brand="Achieve lending"
          tone="achieve"
          lines={[
            `${achMort} states licensed for mortgage / HELOC`,
            `${achPl} states with personal-loan licenses in market`,
            "Debt relief on Achieve follows FDR coverage",
          ]}
        />
        <div className="rounded-xl bg-raised p-3 text-xs leading-relaxed text-muted">
          Sources:{" "}
          <a className="text-fdr hover:underline" href={statesData.source.fdrFacts} target="_blank" rel="noreferrer">
            FDR facts
          </a>
          {" · "}
          <a
            className="text-fdr hover:underline"
            href={statesData.source.achieveLicenses}
            target="_blank"
            rel="noreferrer"
          >
            Achieve licenses
          </a>
          . License ≠ always currently offered. Achieve has said HELOCs cover 31 states.
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 border-b border-border p-3">
        {statesData.states.map((s) => {
          const on = selectedState === s.code;
          const covered =
            s.fdrSettlement !== "none" || s.achieveMortgage || s.achievePersonalLoan !== "none";
          return (
            <button
              key={s.code}
              type="button"
              onClick={() => selectState(s.code)}
              title={s.name}
              className={`h-8 min-w-8 rounded-sm px-1.5 font-mono text-[11px] ${
                on
                  ? "bg-accent text-accent-fg"
                  : covered
                    ? "bg-raised text-fg"
                    : "bg-bg text-subtle"
              }`}
            >
              {s.code}
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[760px] border-collapse text-left text-sm">
          <thead className="sticky top-0 bg-surface text-[10px] uppercase tracking-wide text-subtle">
            <tr>
              <th className="px-3 py-2 font-medium">State</th>
              <th className="px-2 py-2 font-medium">FDR settlement</th>
              <th className="px-2 py-2 font-medium">FDR near-me page</th>
              <th className="px-2 py-2 font-medium">Achieve HELOC/HEL</th>
              <th className="px-2 py-2 font-medium">Achieve personal loan</th>
              <th className="px-2 py-2 font-medium">Achieve DR</th>
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
                  <Badge tone={fdrTone(s.fdrSettlement)}>{FDR_LABEL[s.fdrSettlement]}</Badge>
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
                      Live <ExternalLink className="size-3.5" />
                    </a>
                  ) : (
                    <span className="text-subtle">—</span>
                  )}
                </td>
                <td className="px-2 py-2">
                  <Badge tone={s.achieveMortgage ? "ok" : "neutral"}>
                    {s.achieveMortgage ? "Licensed" : "No license"}
                  </Badge>
                </td>
                <td className="px-2 py-2">
                  <Badge
                    tone={
                      s.achievePersonalLoan === "offered"
                        ? "ok"
                        : s.achievePersonalLoan === "licensed"
                          ? "warn"
                          : "neutral"
                    }
                  >
                    {s.achievePersonalLoan === "offered"
                      ? "Offered"
                      : s.achievePersonalLoan === "licensed"
                        ? "Licensed, gated"
                        : "No license"}
                  </Badge>
                </td>
                <td className="px-2 py-2">
                  <Badge tone={fdrTone(s.achieveDebtRelief)}>{FDR_LABEL[s.achieveDebtRelief]}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Summary({
  brand,
  tone,
  lines,
}: {
  brand: string;
  tone: "fdr" | "achieve";
  lines: string[];
}) {
  return (
    <div className="rounded-xl bg-raised p-3">
      <Badge tone={tone}>{brand}</Badge>
      <ul className="mt-2 space-y-0.5 text-sm text-muted">
        {lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
    </div>
  );
}
