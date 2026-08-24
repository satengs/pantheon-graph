/** Short names for edges — not graph nodes. */
export const ISSUE_ALIAS: Record<string, string> = {
  S01: "same slug",
  S02: "same ask",
  S03: "wrong HEL page",
  S04: "near-duplicate",
  S05: "org @id",
  S06: "corporate sameAs",
  S07: "schema type",
  S08: "loan properties",
  S09: "outline twins",
  S10: "duplicate blocks",
  S11: "breadcrumb",
  S12: "NMLS scope",
  S13: "rating @id",
};

export function edgeTag(code: string): string {
  const a = ISSUE_ALIAS[code];
  return a ? `${a} · ${code}` : code;
}
