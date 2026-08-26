import { ISSUES } from "@/data/issues";
import type { BacklogItem } from "@/lib/graph/types";

/** Content/schema rules from the last crawl, plus JSON-LD. */
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
  "S21",
  "S22",
  "S23",
  "S24",
  "S25",
  "S26",
  "S27",
  "S28",
  "S29",
  "S30",
  "S31",
] as const;

export const RULES: BacklogItem[] = ISSUES.filter((i) =>
  (RULE_CODES as readonly string[]).includes(i.code),
);

export function ruleStatement(i: BacklogItem): string {
  return i.reason;
}

export function ruleCheckJson(code: string): string {
  const map: Record<string, unknown> = {
    S05: { engine: "jsonld", checks: ["org"] },
    S07: { engine: "jsonld", checks: ["type"] },
    S08: { engine: "jsonld", checks: ["props"] },
    S21: { engine: "jsonld", checks: ["exists", "org", "type"] },
  };
  return JSON.stringify(map[code] ?? {});
}

export const DEFAULT_BRAND_CONFIG: Record<"fdr" | "achieve", Record<string, unknown>> = {
  fdr: {
    host: "www.freedomdebtrelief.com",
    owns: ["debt-relief", "settlement"],
    schemaOrg: "https://www.freedomdebtrelief.com/#organization",
    toneAllow: ["settlement", "enrolled", "negotiate", "hardship", "program"],
    toneDeny: ["APR", "draw period", "HELOC"],
    analyzeEndpoint: "",
  },
  achieve: {
    host: "www.achieve.com",
    owns: ["heloc", "hel", "personal-loan"],
    schemaOrg: "https://www.achieve.com/#organization",
    toneAllow: ["HELOC", "equity", "draw", "APR", "personal loan"],
    toneDeny: ["enrolled", "negotiate", "settlement program"],
  },
};
