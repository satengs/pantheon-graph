export type ProofRow = {
  brand: "fdr" | "achieve";
  url: string;
  h1: string;
  canonical: string;
  extra: string;
};

export type IssueProofView = {
  conflict: string;
  rows: ProofRow[];
};

export const ISSUE_PROOFS: Record<string, IssueProofView> = {
  S01: {
    conflict:
      "Canonicals look valid because each page points at itself. Same H1 on both origins. 130 slugs in the last crawl.",
    rows: [
      {
        brand: "fdr",
        url: "https://www.freedomdebtrelief.com/glossary/d/debt-relief/",
        h1: "Debt Relief Meaning & Definition",
        canonical: "https://www.freedomdebtrelief.com/glossary/d/debt-relief/",
        extra: "self-canonical · DefinedTerm “Debt Relief” · WordLift @id …/debt-relief-c4efdbf2…",
      },
      {
        brand: "achieve",
        url: "https://www.achieve.com/glossary/d/debt-relief",
        h1: "Debt Relief Meaning & Definition",
        canonical: "https://www.achieve.com/glossary/d/debt-relief",
        extra: "self-canonical · no JSON-LD · meta description identical to FDR",
      },
      {
        brand: "fdr",
        url: "https://www.freedomdebtrelief.com/glossary/b/bankruptcy/",
        h1: "Bankruptcy Meaning & Definition",
        canonical: "https://www.freedomdebtrelief.com/glossary/b/bankruptcy/",
        extra: "self-canonical · DefinedTerm",
      },
      {
        brand: "achieve",
        url: "https://www.achieve.com/glossary/b/bankruptcy",
        h1: "Bankruptcy Meaning & Definition",
        canonical: "https://www.achieve.com/glossary/b/bankruptcy",
        extra: "self-canonical · no JSON-LD",
      },
    ],
  },
  S02: {
    conflict:
      "Two FDR URLs, two H1s, both self-canonical. Relief page schema is FAQ + AggregateRating, not Service. Settlement page is LocalBusiness. Copy still treats them as the same program.",
    rows: [
      {
        brand: "fdr",
        url: "https://www.freedomdebtrelief.com/debt-relief/",
        h1: "What is Debt Relief?",
        canonical: "https://www.freedomdebtrelief.com/debt-relief/",
        extra: "title: What is debt relief? An Overview · JSON-LD: Question, Answer, AggregateRating, BreadcrumbList — no Service",
      },
      {
        brand: "fdr",
        url: "https://www.freedomdebtrelief.com/debt-solutions/debt-settlement/",
        h1: "What Is Debt Settlement?",
        canonical: "https://www.freedomdebtrelief.com/debt-solutions/debt-settlement/",
        extra: "JSON-LD: LocalBusiness, AggregateRating, Person — no Service. Sibling of relief in IA.",
      },
    ],
  },
  S03: {
    conflict:
      "Glossary HELOC self-canonicals to the glossary URL, not to /heloc. Product /heloc is a separate node. No JSON-LD on either Achieve URL.",
    rows: [
      {
        brand: "achieve",
        url: "https://www.achieve.com/glossary/h/home-equity-line-of-credit",
        h1: "Home Equity Line of Credit (HELOC) Definition & Meaning",
        canonical: "https://www.achieve.com/glossary/h/home-equity-line-of-credit",
        extra: "self-canonical · does not point at /heloc · no JSON-LD",
      },
      {
        brand: "achieve",
        url: "https://www.achieve.com/heloc",
        h1: "HELOC",
        canonical: "https://www.achieve.com/heloc",
        extra: "title: Home Equity Line of Credit (HELOC) - Apply FREE today! · no JSON-LD · should own the entity",
      },
    ],
  },
  S04: {
    conflict: "Last crawl near-duplicates — different strings, same intent.",
    rows: [
      {
        brand: "fdr",
        url: "https://www.freedomdebtrelief.com/glossary/c/credit-limit-or-line/",
        h1: "credit-limit-or-line",
        canonical: "https://www.freedomdebtrelief.com/glossary/c/credit-limit-or-line/",
        extra: "slug vs Achieve credit-limit-or-credit-line",
      },
      {
        brand: "achieve",
        url: "https://www.achieve.com/glossary/c/credit-limit-or-credit-line",
        h1: "credit-limit-or-credit-line",
        canonical: "https://www.achieve.com/glossary/c/credit-limit-or-credit-line",
        extra: "near-duplicate of FDR credit-limit-or-line",
      },
      {
        brand: "fdr",
        url: "https://www.freedomdebtrelief.com/glossary/c/credit-repair/",
        h1: "credit-repair",
        canonical: "https://www.freedomdebtrelief.com/glossary/c/credit-repair/",
        extra: "paired with Achieve credit-report in the crawl near list",
      },
      {
        brand: "achieve",
        url: "https://www.achieve.com/glossary/c/credit-report",
        h1: "credit-report",
        canonical: "https://www.achieve.com/glossary/c/credit-report",
        extra: "near credit-repair — two entities, one cluster",
      },
    ],
  },
  S05: {
    conflict: "Achieve homepage must pin Organization @id. Live HTML on product templates currently ships no JSON-LD at all.",
    rows: [
      {
        brand: "achieve",
        url: "https://www.achieve.com/",
        h1: "Achieve",
        canonical: "https://www.achieve.com/",
        extra: "Need @id https://www.achieve.com/#organization — rotating or missing org mints duplicates",
      },
    ],
  },
  S06: {
    conflict: "Corporate relationship is written in copy; schema does not sameAs the two Organization nodes.",
    rows: [
      {
        brand: "achieve",
        url: "https://www.achieve.com/about/achieve-and-freedom-debt-relief",
        h1: "Achieve and Freedom Debt Relief",
        canonical: "https://www.achieve.com/about/achieve-and-freedom-debt-relief",
        extra: "Copy states FDR is Achieve’s debt relief program. Organization.sameAs is still missing.",
      },
    ],
  },
  S07: {
    conflict: "FDR /debt-relief/ emits FAQ + AggregateRating as siblings, not one Service. Achieve /heloc has no JSON-LD.",
    rows: [
      {
        brand: "fdr",
        url: "https://www.freedomdebtrelief.com/debt-relief/",
        h1: "What is Debt Relief?",
        canonical: "https://www.freedomdebtrelief.com/debt-relief/",
        extra: "types: Question, Answer, AggregateRating, BreadcrumbList — no Service / FinancialProduct",
      },
      {
        brand: "achieve",
        url: "https://www.achieve.com/heloc",
        h1: "HELOC",
        canonical: "https://www.achieve.com/heloc",
        extra: "no application/ld+json — missing LoanOrCredit entirely",
      },
    ],
  },
  S08: {
    conflict: "Achieve lending URLs have no LoanOrCredit node, so interestRate / APR / term cannot exist.",
    rows: [
      {
        brand: "achieve",
        url: "https://www.achieve.com/heloc",
        h1: "HELOC",
        canonical: "https://www.achieve.com/heloc",
        extra: "no JSON-LD · missing interestRate, annualPercentageRate, loanTerm, amount",
      },
    ],
  },
  S09: {
    conflict: "HEL and HELOC are sibling nav items with the same “Apply FREE” template skeleton.",
    rows: [
      {
        brand: "achieve",
        url: "https://www.achieve.com/heloc",
        h1: "HELOC",
        canonical: "https://www.achieve.com/heloc",
        extra: "title pattern Apply FREE today · should own draw / variable-rate outline",
      },
      {
        brand: "achieve",
        url: "https://www.achieve.com/home-equity-loan",
        h1: "HOME EQUITY LOANS",
        canonical: "https://www.achieve.com/home-equity-loan",
        extra: "sibling product · lump sum / fixed rate must not reuse HELOC H2s",
      },
    ],
  },
  S10: {
    conflict: "Use-case modules repeat across lending products in the last crawl’s product set.",
    rows: [
      {
        brand: "achieve",
        url: "https://www.achieve.com/personal-loans",
        h1: "PERSONAL LOANS",
        canonical: "https://www.achieve.com/personal-loans",
        extra: "114 personal-loan URLs in last crawl — template-level duplication risk",
      },
    ],
  },
  S11: {
    conflict: "Personal-loan must breadcrumb under Loans, never Debt Relief.",
    rows: [
      {
        brand: "achieve",
        url: "https://www.achieve.com/personal-loans",
        h1: "PERSONAL LOANS",
        canonical: "https://www.achieve.com/personal-loans",
        extra: "BreadcrumbList must be Home > Loans > Personal loans",
      },
    ],
  },
  S12: {
    conflict: "NMLS / origination language on a debt-relief URL attaches the wrong regulated entity.",
    rows: [
      {
        brand: "achieve",
        url: "https://www.achieve.com/debt-relief",
        h1: "DEBT RELIEF",
        canonical: "https://www.achieve.com/debt-relief",
        extra: "title: DEBT RELIEF (Resolve Your Debt, Apply FREE!) · not a LoanOrCredit page",
      },
    ],
  },
  S13: {
    conflict: "FDR relief page already emits AggregateRating. Achieve /debt-relief must not reuse that node.",
    rows: [
      {
        brand: "fdr",
        url: "https://www.freedomdebtrelief.com/debt-relief/",
        h1: "What is Debt Relief?",
        canonical: "https://www.freedomdebtrelief.com/debt-relief/",
        extra: "JSON-LD includes AggregateRating — FDR owns the review entity",
      },
      {
        brand: "achieve",
        url: "https://www.achieve.com/debt-relief",
        h1: "DEBT RELIEF",
        canonical: "https://www.achieve.com/debt-relief",
        extra: "same product path · must not bind itemReviewed to FDR",
      },
    ],
  },
  S21: {
    conflict: "JSON-LD missing or typed wrong on live product/glossary URLs.",
    rows: [
      {
        brand: "achieve",
        url: "https://www.achieve.com/heloc",
        h1: "HELOC",
        canonical: "https://www.achieve.com/heloc",
        extra: "no application/ld+json",
      },
      {
        brand: "fdr",
        url: "https://www.freedomdebtrelief.com/debt-relief/",
        h1: "What is Debt Relief?",
        canonical: "https://www.freedomdebtrelief.com/debt-relief/",
        extra: "has JSON-LD but no Service — FAQ/Rating instead",
      },
    ],
  },
  S22: {
    conflict: "Last crawl: both sitemaps include /debt-relief as a product URL.",
    rows: [
      {
        brand: "fdr",
        url: "https://www.freedomdebtrelief.com/debt-relief/",
        h1: "What is Debt Relief?",
        canonical: "https://www.freedomdebtrelief.com/debt-relief/",
        extra: "kind r · FDR should own this node",
      },
      {
        brand: "achieve",
        url: "https://www.achieve.com/debt-relief",
        h1: "DEBT RELIEF",
        canonical: "https://www.achieve.com/debt-relief",
        extra: "kind r · same path on Achieve · Apply FREE template",
      },
    ],
  },
  S23: {
    conflict: "Last crawl: 15 FDR URLs tagged heloc / hel / personal-loan.",
    rows: [
      {
        brand: "fdr",
        url: "https://www.freedomdebtrelief.com/learn/loans/how-does-a-heloc-work/",
        h1: "How does a HELOC work?",
        canonical: "https://www.freedomdebtrelief.com/learn/loans/how-does-a-heloc-work/",
        extra: "FDR article on HELOC — Achieve owns that product",
      },
      {
        brand: "fdr",
        url: "https://www.freedomdebtrelief.com/glossary/p/personal-loan/",
        h1: "Personal Loan",
        canonical: "https://www.freedomdebtrelief.com/glossary/p/personal-loan/",
        extra: "FDR glossary DefinedTerm for a lending product",
      },
    ],
  },
  S24: {
    conflict: "Last crawl: Achieve has /debt-relief plus press URLs tagged debt-relief/settlement.",
    rows: [
      {
        brand: "achieve",
        url: "https://www.achieve.com/debt-relief",
        h1: "DEBT RELIEF",
        canonical: "https://www.achieve.com/debt-relief",
        extra: "product path clone of FDR",
      },
      {
        brand: "achieve",
        url: "https://www.achieve.com/about/press/achieve-launches-achieve-debt-relief-a-personalized-program-to-help-americans-reduce-debt",
        h1: "Achieve launches Achieve Debt Relief",
        canonical:
          "https://www.achieve.com/about/press/achieve-launches-achieve-debt-relief-a-personalized-program-to-help-americans-reduce-debt",
        extra: "NewsArticle is fine; must not mint a second Service node",
      },
    ],
  },
  S25: {
    conflict: "Last crawl overlap includes APR, mortgage, personal-loan, interest-rate — FDR must not own those DefinedTerms.",
    rows: [
      {
        brand: "fdr",
        url: "https://www.freedomdebtrelief.com/glossary/a/annual-percentage-rate/",
        h1: "Annual Percentage Rate (APR) Definition & Meaning",
        canonical: "https://www.freedomdebtrelief.com/glossary/a/annual-percentage-rate/",
        extra: "self-canonical · DefinedTerm on the settlement origin",
      },
      {
        brand: "achieve",
        url: "https://www.achieve.com/glossary/a/annual-percentage-rate",
        h1: "Annual Percentage Rate (APR) Definition & Meaning",
        canonical: "https://www.achieve.com/glossary/a/annual-percentage-rate",
        extra: "identical H1 · Achieve should be the sole owner",
      },
    ],
  },
  S26: {
    conflict: "Captured Achieve glossary HTML has zero ld+json scripts. FDR same slugs emit DefinedTerm.",
    rows: [
      {
        brand: "achieve",
        url: "https://www.achieve.com/glossary/d/debt-relief",
        h1: "Debt Relief Meaning & Definition",
        canonical: "https://www.achieve.com/glossary/d/debt-relief",
        extra: "types: (none)",
      },
      {
        brand: "fdr",
        url: "https://www.freedomdebtrelief.com/glossary/d/debt-relief/",
        h1: "Debt Relief Meaning & Definition",
        canonical: "https://www.freedomdebtrelief.com/glossary/d/debt-relief/",
        extra: "types: DefinedTerm, FinancialService, Person…",
      },
    ],
  },
};
