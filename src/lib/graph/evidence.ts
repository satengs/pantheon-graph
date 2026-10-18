import { useEffect, useState } from "react";

import { crawl, pageUrl } from "@/data/crawl";
import type { Severity, SeverityFilter } from "@/lib/graph/severity";
import { SEVERITIES, SEVERITY_COLOR, urlKey } from "@/lib/graph/severity";
import { evidenceLabel, normSeverity } from "@/lib/graph/evidence-label";
import { BUILD_SHA } from "@/lib/build-info";

/**
 * Evidence Brief issues (public/data/evidence.json, built by `npm run import:evidence`).
 * Severity comes from the brief's own wording (P0 → critical); rows with no basis
 * stay "unrated". Nothing here re-scores them.
 */
export type EvSeverity = Severity | "unrated";
export type EvStatus = "open" | "partly fixed" | "fixed";

export type EvidenceItem = {
  id: string;
  row: number | null;
  source: "brief" | "ndr-vs-fdr";
  title: string;
  brand: string;
  urls: string[];
  owner: string;
  status: EvStatus;
  statusText: string;
  firstSeen: string;
  lastSeen: string;
  daysOpen: number | null;
  severity: EvSeverity;
  severityBasis: string;
  why: string;
  fix: string;
  firstReport?: string;
  links: string[];
  refs: string[];
  screenshots: Array<{ file: string; name: string; pack: string; date: string }>;
  match: { kind: "page" | "site-wide" | "unmapped"; nodes: string[]; reason?: string; drawn?: boolean };
  unmatchedUrls?: string[];
};

export type EvidenceDoc = {
  version: number;
  asOf: string;
  newestBrief: { kind: "daily" | "weekly"; date: string; file: string };
  summary: Record<string, unknown>;
  items: EvidenceItem[];
};

export const EV_SEVERITIES: EvSeverity[] = [...SEVERITIES, "unrated"];
export const EV_COLOR: Record<EvSeverity, string> = { ...SEVERITY_COLOR, unrated: "#9aa3ad" };
export const EV_GLYPH: Record<EvSeverity, string> = { critical: "C", high: "H", medium: "M", low: "L", unrated: "?" };
export const EV_LABEL: Record<EvSeverity, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
  unrated: "Unrated",
};

export type SourceFilter = "pantheon" | "evidence" | "both";
/** Severity chips plus "unrated", which only Evidence rows can carry. */
export type EvSeverityFilter = SeverityFilter | "unrated";

export function evRank(s: EvSeverity) {
  return EV_SEVERITIES.indexOf(s);
}

export function evMatches(s: EvSeverity, f: EvSeverityFilter) {
  if (f === "all") return true;
  if (f === "crit-high") return s === "critical" || s === "high";
  return s === f;
}

export type EvRollup = { worst: EvSeverity; count: number; pages: number; items: EvidenceItem[] };

function roll(items: Iterable<EvidenceItem>, pages: number): EvRollup | null {
  const uniq = [...new Map([...items].map((i) => [i.id, i])).values()];
  if (!uniq.length) return null;
  uniq.sort(
    (a, b) =>
      evRank(a.severity) - evRank(b.severity) ||
      (a.status === "fixed" ? 1 : 0) - (b.status === "fixed" ? 1 : 0) ||
      (b.daysOpen ?? 0) - (a.daysOpen ?? 0) ||
      a.id.localeCompare(b.id, undefined, { numeric: true }),
  );
  return { worst: uniq[0]!.severity, count: uniq.length, pages, items: uniq };
}

export function filterEvRollup(r: EvRollup | null, f: EvSeverityFilter): EvRollup | null {
  if (!r || f === "all") return r;
  const items = r.items.filter((i) => evMatches(i.severity, f));
  return items.length ? { ...r, worst: items[0]!.severity, count: items.length, items } : null;
}

export type EvidenceIndex = {
  byUrl: Map<string, EvidenceItem[]>;
  siteWide: Map<string, EvidenceItem[]>;
  unmapped: EvidenceItem[];
  forPage: (url: string | undefined) => EvRollup | null;
  forHub: (brand: string, product: string) => EvRollup | null;
  /** Brand node: its site-wide rows + every page row on that brand. */
  forBrand: (brand: string) => EvRollup | null;
  siteWideFor: (brand: string) => EvRollup | null;
  forAll: () => EvRollup | null;
};

export function buildEvidenceIndex(doc: EvidenceDoc | null, brandFilter: string | "all" = "all"): EvidenceIndex {
  const byUrl = new Map<string, EvidenceItem[]>();
  const siteWide = new Map<string, EvidenceItem[]>();
  const unmapped: EvidenceItem[] = [];
  const items = (doc?.items ?? []).filter((i) => brandFilter === "all" || i.brand === brandFilter);
  for (const it of items) {
    if (it.match.kind === "page") {
      for (const k of it.match.nodes) byUrl.set(k, [...(byUrl.get(k) ?? []), it]);
    } else if (it.match.kind === "site-wide") {
      siteWide.set(it.brand, [...(siteWide.get(it.brand) ?? []), it]);
    } else unmapped.push(it);
  }
  const keysOf = (pred: (b: string, p: string) => boolean) =>
    crawl.pages.filter((p) => pred(p.b, p.p)).map((p) => urlKey(pageUrl(p)));
  const rollKeys = (keys: string[], extra: EvidenceItem[] = []) => {
    const hit: EvidenceItem[] = [...extra];
    let pages = 0;
    for (const k of new Set(keys)) {
      const l = byUrl.get(k);
      if (!l?.length) continue;
      pages += 1;
      hit.push(...l);
    }
    return roll(hit, pages);
  };
  return {
    byUrl,
    siteWide,
    unmapped,
    forPage: (url) => (url ? rollKeys([urlKey(url)]) : null),
    forHub: (b, p) => rollKeys(keysOf((pb, pp) => pb === b && pp === p)),
    forBrand: (b) => rollKeys(keysOf((pb) => pb === b), siteWide.get(b) ?? []),
    siteWideFor: (b) => roll(siteWide.get(b) ?? [], 0),
    forAll: () => rollKeys([...byUrl.keys()], [...siteWide.values()].flat()),
  };
}

let cache: EvidenceDoc | null = null;
let inflight: Promise<EvidenceDoc | null> | null = null;

/**
 * Coerce a fetched evidence.json into the current shape. Severity goes through normSeverity, so a
 * legacy "unknown" key (pre-rename file, or an old copy from the HTTP cache) or a missing field
 * becomes "unrated" instead of leaking into labels as "unknown" / "undefined".
 */
export function normalizeEvidenceDoc(raw: unknown): EvidenceDoc | null {
  const d = raw as Partial<EvidenceDoc> | null;
  if (!d || !Array.isArray(d.items) || !d.newestBrief) return null;
  return { ...(d as EvidenceDoc), items: d.items.map((i) => ({ ...i, severity: normSeverity(i?.severity) })) };
}

function load(): Promise<EvidenceDoc | null> {
  if (cache) return Promise.resolve(cache);
  // Build-keyed URL + revalidate: a new deployment never reads an older deployment's cached file.
  inflight ??= fetch(`/data/evidence.json?v=${encodeURIComponent(BUILD_SHA)}`, { cache: "no-cache" })
    .then((r) => (r.ok ? (r.json() as Promise<unknown>) : null))
    .then((d) => (cache = normalizeEvidenceDoc(d)))
    .catch(() => null);
  return inflight;
}

/** Loads evidence.json once per session; null until it arrives (or if absent). */
export function useEvidence(): EvidenceDoc | null {
  const [doc, setDoc] = useState<EvidenceDoc | null>(cache);
  useEffect(() => {
    if (doc) return;
    let live = true;
    void load().then((d) => live && setDoc(d));
    return () => {
      live = false;
    };
  }, [doc]);
  return doc;
}

/** Neutral colour for the Evidence tag: never a severity hue, so it can't read as a C/H/M/L pill. */
export const EV_TAG_STROKE = "#c9d1d9";
export const EV_TAG_FILL = "#0b0c0e";

/** Worst *rated* severity in a roll-up and how many rows carry it (unrated / legacy keys ignored). */
export function evWorstRated(r: EvRollup | null): { sev: Severity; n: number } | null {
  return evidenceLabel(r?.items)?.worst ?? null;
}

/** Thin wrapper over the single label function (evidence-label.ts). "" when there are no rows. */
export function evTagText(r: EvRollup | null, compact = false): string {
  const l = evidenceLabel(r?.items);
  if (!l) return "";
  return compact ? `Ev ${l.compact.join(" · ")}` : l.full;
}
