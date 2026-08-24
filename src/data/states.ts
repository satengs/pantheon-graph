import raw from "./states.json";

export type FdrCoverage = "direct" | "partner" | "none";
export type OfferStatus = "offered" | "licensed" | "none";
export type PersonalLoanStatus = OfferStatus;

export type StateLicense = {
  entity: "achieve.com" | "achieve-loans" | "achieve-personal-loans";
  nmls: string;
  name: string;
  number: string;
  kind: "mortgage" | "personal-loan" | "collections" | "other";
};

export type StateEntity = {
  id: string;
  name: string;
  host: string;
  nmls: string | null;
  services: string[];
};

export type StateRow = {
  code: string;
  name: string;
  fdrSettlement: FdrCoverage;
  fdrNearMe: boolean;
  fdrUrl: string | null;
  fdrCityPages: number;
  achieveHeloc: OfferStatus;
  achievePersonalLoan: PersonalLoanStatus;
  achieveCollections: boolean;
  achieveDebtRelief: FdrCoverage;
  licenses: StateLicense[];
};

export type StatesSnapshot = {
  source: {
    fdrFacts: string;
    fdrNearMe: string;
    achieveLicenses: string;
    achieveHeloc: string;
    achieveHel: string;
    achievePersonalLoans: string;
    achieveDebtRelief: string;
    helocOfferedReview: string;
    personalLoanReview: string;
    capturedAt: string;
  };
  entities: StateEntity[];
  notes: {
    fdrDirect: string[];
    fdrPartner: string[];
    fdrNone: string[];
    achieveHelocClaim: string;
    helocNotOfferedNamed: string[];
    personalLoanExclusionsPublished: string[];
    fdrService: string;
    achieveDebtRelief: string;
  };
  states: StateRow[];
};

export const statesData = raw as StatesSnapshot;

export const FDR_LABEL: Record<FdrCoverage, string> = {
  direct: "Direct settlement",
  partner: "Legal partner",
  none: "Not offered",
};

export const OFFER_LABEL: Record<OfferStatus, string> = {
  offered: "Offered",
  licensed: "Licensed, gated",
  none: "Not offered",
};

export type ServiceId =
  | "settlement"
  | "near-me"
  | "heloc"
  | "hel"
  | "personal-loan"
  | "debt-relief"
  | "collections";

export type BrandService = {
  id: ServiceId;
  brand: "fdr" | "achieve";
  label: string;
  entity: string;
  url: string;
};

export const SERVICE_CATALOG: BrandService[] = [
  {
    id: "settlement",
    brand: "fdr",
    label: "Debt settlement",
    entity: "Freedom Debt Relief",
    url: "https://www.freedomdebtrelief.com/debt-solutions/debt-settlement/",
  },
  {
    id: "near-me",
    brand: "fdr",
    label: "Local near-me pages",
    entity: "Freedom Debt Relief",
    url: "https://www.freedomdebtrelief.com/debt-consolidation-near-me/",
  },
  {
    id: "heloc",
    brand: "achieve",
    label: "HELOC",
    entity: "Achieve Loans · NMLS 1810501",
    url: "https://www.achieve.com/heloc",
  },
  {
    id: "hel",
    brand: "achieve",
    label: "Home equity loan",
    entity: "Achieve Loans · NMLS 1810501",
    url: "https://www.achieve.com/home-equity-loan",
  },
  {
    id: "personal-loan",
    brand: "achieve",
    label: "Personal loans",
    entity: "Achieve.com · NMLS 138464",
    url: "https://www.achieve.com/personal-loans",
  },
  {
    id: "debt-relief",
    brand: "achieve",
    label: "Debt relief",
    entity: "FDR program on Achieve",
    url: "https://www.achieve.com/debt-relief",
  },
  {
    id: "collections",
    brand: "achieve",
    label: "Collections / servicing",
    entity: "Achieve Personal Loans · NMLS 227977",
    url: "https://www.achieve.com/licenses",
  },
];

export type IdentifiedService = {
  id: ServiceId;
  brand: "fdr" | "achieve";
  label: string;
  status: FdrCoverage | OfferStatus | "content" | "none";
  detail: string;
  url: string | null;
};

export function identifyServices(row: StateRow): IdentifiedService[] {
  return [
    {
      id: "settlement",
      brand: "fdr",
      label: "Debt settlement",
      status: row.fdrSettlement,
      detail: FDR_LABEL[row.fdrSettlement],
      url:
        row.fdrSettlement === "none"
          ? null
          : "https://www.freedomdebtrelief.com/debt-solutions/debt-settlement/",
    },
    {
      id: "near-me",
      brand: "fdr",
      label: "Local near-me pages",
      status: row.fdrNearMe ? "content" : "none",
      detail: row.fdrNearMe
        ? row.fdrCityPages
          ? `State page + ${row.fdrCityPages} city page${row.fdrCityPages === 1 ? "" : "s"}`
          : "State landing page"
        : row.fdrCityPages
          ? `${row.fdrCityPages} city page${row.fdrCityPages === 1 ? "" : "s"} only`
          : "No local page",
      url: row.fdrUrl,
    },
    {
      id: "heloc",
      brand: "achieve",
      label: "HELOC",
      status: row.achieveHeloc,
      detail: OFFER_LABEL[row.achieveHeloc],
      url: row.achieveHeloc === "none" ? null : "https://www.achieve.com/heloc",
    },
    {
      id: "hel",
      brand: "achieve",
      label: "Home equity loan",
      status: row.achieveHeloc,
      detail: OFFER_LABEL[row.achieveHeloc],
      url: row.achieveHeloc === "none" ? null : "https://www.achieve.com/home-equity-loan",
    },
    {
      id: "personal-loan",
      brand: "achieve",
      label: "Personal loans",
      status: row.achievePersonalLoan,
      detail: OFFER_LABEL[row.achievePersonalLoan],
      url: row.achievePersonalLoan === "none" ? null : "https://www.achieve.com/personal-loans",
    },
    {
      id: "debt-relief",
      brand: "achieve",
      label: "Debt relief",
      status: row.achieveDebtRelief,
      detail: FDR_LABEL[row.achieveDebtRelief],
      url: row.achieveDebtRelief === "none" ? null : "https://www.achieve.com/debt-relief",
    },
    {
      id: "collections",
      brand: "achieve",
      label: "Collections / servicing",
      status: row.achieveCollections ? "licensed" : "none",
      detail: row.achieveCollections ? "Collection license on file" : "No collection license",
      url: row.achieveCollections ? "https://www.achieve.com/licenses" : null,
    },
  ];
}

export function statusTone(
  status: IdentifiedService["status"],
): "ok" | "warn" | "neutral" | "fdr" | "achieve" {
  if (status === "direct" || status === "offered") return "ok";
  if (status === "partner" || status === "licensed" || status === "content") return "warn";
  return "neutral";
}

export function stateByCode(code: string): StateRow | undefined {
  return statesData.states.find((s) => s.code === code);
}

/** Approximate geographic chip layout for the 50 states + DC. */
export const US_LAYOUT: Array<Array<string | null>> = [
  ["AK", null, null, null, null, null, null, null, null, null, "ME"],
  [null, null, null, null, null, null, null, null, null, "VT", "NH"],
  ["WA", "ID", "MT", "ND", "MN", "IL", "WI", "MI", "NY", "MA", "RI"],
  ["OR", "NV", "WY", "SD", "IA", "IN", "OH", "PA", "NJ", "CT", null],
  ["CA", "UT", "CO", "NE", "MO", "KY", "WV", "VA", "MD", "DE", null],
  [null, "AZ", "NM", "KS", "AR", "TN", "NC", "SC", null, null, null],
  [null, null, null, "OK", "LA", "MS", "AL", "GA", null, null, null],
  ["HI", null, null, "TX", null, null, null, "FL", null, "DC", null],
];
