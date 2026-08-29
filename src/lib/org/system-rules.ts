/** Technical checks that apply to every origin — not a brand fight. */
/** Technical checks that apply to every origin — not a brand fight. */
export const SYSTEM_RULE_CODES = [
  "S04",
  "S07",
  "S21",
  "S27",
  "S28",
  "S29",
  "S30",
  "S31",
] as const;

export const SYSTEM_RULE_SET = new Set<string>(SYSTEM_RULE_CODES);

export function isSystemRule(code: string, domain?: string): boolean {
  if (domain === "system") return true;
  return SYSTEM_RULE_SET.has(code);
}
