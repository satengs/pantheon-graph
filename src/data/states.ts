import raw from "./states.json";

export type FdrCoverage = "direct" | "partner" | "none";
export type PersonalLoanStatus = "offered" | "licensed" | "none";

export type StateLicense = {
  entity: "achieve.com" | "achieve-loans" | "achieve-personal-loans";
  nmls: string;
  name: string;
  number: string;
  kind: "mortgage" | "personal-loan" | "collections" | "other";
};

export type StateRow = {
  code: string;
  name: string;
  fdrSettlement: FdrCoverage;
  fdrNearMe: boolean;
  fdrUrl: string | null;
  achieveMortgage: boolean;
  achievePersonalLoan: PersonalLoanStatus;
  achieveCollections: boolean;
  achieveDebtRelief: FdrCoverage;
  licenses: StateLicense[];
};

export type StatesSnapshot = {
  source: { fdrFacts: string; fdrNearMe: string; achieveLicenses: string; capturedAt: string };
  notes: {
    fdrDirect: string[];
    fdrPartner: string[];
    achieveHelocClaim: string;
    personalLoanExclusionsPublished: string[];
  };
  states: StateRow[];
};

export const statesData = raw as StatesSnapshot;

export const FDR_LABEL: Record<FdrCoverage, string> = {
  direct: "FDR direct",
  partner: "Legal partner",
  none: "Not offered",
};

export function stateByCode(code: string): StateRow | undefined {
  return statesData.states.find((s) => s.code === code);
}
