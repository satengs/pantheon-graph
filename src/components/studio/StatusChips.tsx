import { SOURCE_CHIP_LABEL, SOURCE_FILTERS } from "@/lib/graph/evidence-filter";
import { EV_TAG_FILL, EV_TAG_STROKE, type EvidenceItem } from "@/lib/graph/evidence";
import { itemSources } from "@/lib/graph/evidence-filter";

const chipClass =
  "inline-flex h-5 max-w-full shrink-0 items-center truncate border px-1.5 text-[10px] font-medium leading-none";
const chipStyle = { borderColor: EV_TAG_STROKE, color: EV_TAG_STROKE, background: EV_TAG_FILL } as const;

/** Neutral outline source / status chips. Never pink, never a filled severity pill, never a left stripe. */
export function NeutralChip({
  children,
  title,
  testId,
}: {
  children: string;
  title?: string;
  testId?: string;
}) {
  return (
    <span className={chipClass} style={chipStyle} title={title ?? children} data-testid={testId}>
      {children}
    </span>
  );
}

export function SourceChips({
  item,
  pantheon = false,
}: {
  item?: Pick<EvidenceItem, "source" | "sources" | "confirmations">;
  pantheon?: boolean;
}) {
  const chips: Array<{ id: keyof typeof SOURCE_CHIP_LABEL; label: string }> = [];
  if (pantheon) chips.push({ id: "pantheon", label: SOURCE_CHIP_LABEL.pantheon });
  if (item) {
    for (const s of itemSources(item)) chips.push({ id: s, label: SOURCE_CHIP_LABEL[s] });
    if ((item.confirmations ?? []).includes("funnel-fix")) chips.push({ id: "funnel-fix", label: SOURCE_CHIP_LABEL["funnel-fix"] });
  }
  if (!chips.length) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1" data-testid="source-chips">
      {chips.map((c) => (
        <NeutralChip key={c.id} testId={`source-chip-${c.id}`}>
          {c.label}
        </NeutralChip>
      ))}
    </span>
  );
}

export function VerificationChip({ item }: { item: Pick<EvidenceItem, "verification" | "verificationNote"> }) {
  if (item.verification === "to_verify") {
    return (
      <NeutralChip title="Not counted in Gate until Funnel Fix confirms" testId="to-verify-chip">
        ? to verify
      </NeutralChip>
    );
  }
  if (item.verification === "unverified") {
    const label = item.verificationNote || "unverified: needs Search Console or Cloudflare access";
    return (
      <NeutralChip title={label} testId="unverified-chip">
        {label}
      </NeutralChip>
    );
  }
  return null;
}

export function FlagChips({ item }: { item: Pick<EvidenceItem, "flags" | "scope"> }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {item.flags?.directional ? (
        <NeutralChip title="Directional: treat as a signal, not a scored finding" testId="directional-chip">
          directional
        </NeutralChip>
      ) : null}
      {item.flags?.gap ? (
        <NeutralChip title="Content gap — no page, no URL" testId="gap-chip">
          {item.scope || "gap, no page"}
        </NeutralChip>
      ) : null}
      {item.flags?.cluster && !item.flags?.gap ? (
        <NeutralChip title={item.scope || "Cluster issue"} testId="cluster-chip">
          {item.scope || "cluster"}
        </NeutralChip>
      ) : null}
    </span>
  );
}

export function ToVerifyNote({
  toVerify,
  unverified,
  testId = "to-verify-count",
}: {
  toVerify: number;
  unverified?: number;
  testId?: string;
}) {
  return (
    <span
      className="text-[11px] text-muted"
      data-testid={testId}
      data-to-verify={toVerify}
      data-unverified={unverified ?? 0}
    >
      {toVerify > 0 ? (
        <span data-testid="to-verify-gate-note">
          {toVerify} to verify, not counted until confirmed
        </span>
      ) : (
        <span className="text-subtle">0 to verify</span>
      )}
      {unverified ? (
        <span className="text-subtle">
          {" "}
          · {unverified} unverified, not counted
        </span>
      ) : null}
    </span>
  );
}

export function SourceBar({
  value,
  onChange,
}: {
  value: import("@/lib/graph/evidence").SourceFilter;
  onChange: (id: import("@/lib/graph/evidence").SourceFilter) => void;
}) {
  return (
    <span role="radiogroup" aria-label="Issue source" className="inline-flex flex-wrap gap-1" data-testid="source-bar">
      {SOURCE_FILTERS.map((c) => (
        <button
          key={c.id}
          type="button"
          role="radio"
          aria-checked={value === c.id}
          data-source-chip={c.id}
          onClick={() => onChange(c.id)}
          className={`inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] ${value === c.id ? "bg-accent text-accent-fg" : "bg-raised text-muted"}`}
        >
          {c.label}
        </button>
      ))}
    </span>
  );
}
