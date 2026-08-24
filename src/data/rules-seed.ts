import { ISSUES } from "@/data/issues";
import type { BacklogItem } from "@/lib/graph/types";

/** Content/schema rules the gate runs against. S01–S13 only. */
export const RULE_CODES = [
  "S01",
  "S02",
  "S03",
  "S04",
  "S05",
  "S06",
  "S07",
  "S08",
  "S09",
  "S10",
  "S11",
  "S12",
  "S13",
] as const;

export const RULES: BacklogItem[] = ISSUES.filter((i) =>
  (RULE_CODES as readonly string[]).includes(i.code),
);

export function ruleStatement(i: BacklogItem): string {
  return i.reason;
}

export const DEFAULT_BRAND_CONFIG: Record<"fdr" | "achieve", Record<string, unknown>> = {
  fdr: {
    host: "www.freedomdebtrelief.com",
    owns: ["debt-relief", "settlement"],
    schemaOrg: "https://www.freedomdebtrelief.com/#organization",
    toneAllow: ["settlement", "enrolled", "negotiate", "hardship", "program"],
    toneDeny: ["APR", "draw period", "HELOC"],
  },
  achieve: {
    host: "www.achieve.com",
    owns: ["heloc", "hel", "personal-loan"],
    schemaOrg: "https://www.achieve.com/#organization",
    toneAllow: ["HELOC", "equity", "draw", "APR", "personal loan"],
    toneDeny: ["enrolled", "negotiate", "settlement program"],
  },
};
