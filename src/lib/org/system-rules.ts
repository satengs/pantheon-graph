/** Checks that apply to every origin — schema, canonical, semantics. Not a brand fight. */
export const SYSTEM_RULE_CODES = [
  "S01",
  "S04",
  "S05",
  "S07",
  "S08",
  "S09",
  "S10",
  "S11",
  "S12",
  "S13",
  "S21",
  "S26",
  "S27",
  "S28",
  "S29",
  "S30",
  "S31",
  "S32",
] as const;

export const SYSTEM_RULE_SET = new Set<string>(SYSTEM_RULE_CODES);

export function isSystemRule(code: string, domain?: string): boolean {
  if (domain === "system") return true;
  return SYSTEM_RULE_SET.has(code);
}
