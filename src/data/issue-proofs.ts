export type ProofRow = {
  brand: "fdr" | "achieve";
  url: string;
  h1: string;
  canonical: string;
  extra: string;
};

export type ProofPair = { query: string; fdr: string; achieve: string };

export type IssueProofView = {
  conflict: string;
  rows: ProofRow[];
  /** Head-to-head FDR vs Achieve URLs competing for the same query. */
  pairs?: ProofPair[];
  /** Specific leftover items: one URL, what's wrong, the fix, who owns it. */
  residual?: Array<{ url: string; problem: string; fix: string; owner: string }>;
  /** Show crawl.redirected entries for this brand whose path contains this text. */
  redirected?: { brand: "fdr" | "achieve"; pathIncludes: string };
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
      "FAQ “What are the pros and cons of debt settlement?” correctly links the pros-and-cons article. Recommended reads already links /debt-solutions/debt-settlement/ as “Debt Solutions”. Remaining issue is copy treating settlement as a synonym of relief.",
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
      "Glossary HELOC definition links the word HELOC to /home-equity-loan, not /heloc. Keep the glossary self-canonical. Do not canonical the definition to the product.",
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
    conflict:
      "Resolved 2026-10-09: Achieve /debt-relief and its subpages 301 to FDR, and /learn/debt-relief 301s to FDR /l/debt-relief/. Leftovers are listed under S24.",
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
    conflict:
      "Head term resolved. What's left: 4 specific cleanup items, 17 Achieve /learn/debt-basics/ articles still targeting FDR's debt-relief queries, and the URLs already fixed by redirect.",
    residual: [
      { url: "https://www.achieve.com/sitemap-video.xml", problem: "Lists 17 /debt-relief* URLs (10× /debt-relief plus 7 subpage entries) that now 301 to FDR.", fix: "Remove them from the video sitemap.", owner: "Achieve public site" },
      { url: "https://www.achieve.com/sitemap-general.xml", problem: "Still lists /learn/debt-relief, 8 old /learn/debt-relief/* articles and /debt-relief, which all redirect.", fix: "List only final 200 URLs.", owner: "Achieve public site" },
      { url: "https://www.achieve.com/debt-relief/debt-relief-faq", problem: "Returns 404 (the other subpages 301 to FDR).", fix: "301 to https://www.freedomdebtrelief.com/faq/ or remove links to it.", owner: "Achieve public site" },
      { url: "https://www.freedomdebtrelief.com/l/debt-relief/", problem: "Is the target of Achieve’s /learn/debt-relief 301 but isn’t in any FDR sitemap.", fix: "Add it to FDR’s sitemap, or point the 301 at FDR /debt-relief/.", owner: "FDR public site" },
    ],
    redirected: { brand: "achieve", pathIncludes: "debt-relief" },
    pairs: [
      { query: "what is debt relief", fdr: "https://www.freedomdebtrelief.com/debt-relief/", achieve: "https://www.achieve.com/learn/debt-basics/what-is-debt-relief" },
      { query: "what is debt relief (video)", fdr: "https://www.freedomdebtrelief.com/debt-relief/", achieve: "https://www.achieve.com/learn/debt-basics/what-is-debt-relief-video" },
      { query: "how does debt relief work", fdr: "https://www.freedomdebtrelief.com/debt-relief/how-debt-relief-programs-work/", achieve: "https://www.achieve.com/learn/debt-basics/how-does-debt-relief-work" },
      { query: "debt relief program", fdr: "https://www.freedomdebtrelief.com/debt-relief-program/", achieve: "https://www.achieve.com/learn/debt-basics/debt-relief-program" },
      { query: "is debt relief legit", fdr: "https://www.freedomdebtrelief.com/debt-relief/is-debt-relief-legit/", achieve: "https://www.achieve.com/learn/debt-basics/is-debt-relief-legit" },
      { query: "is debt relief a good idea", fdr: "https://www.freedomdebtrelief.com/learn/debt-relief/is-a-debt-relief-program-a-good-idea/", achieve: "https://www.achieve.com/learn/debt-basics/is-debt-relief-a-good-idea" },
      { query: "debt relief vs bankruptcy", fdr: "https://www.freedomdebtrelief.com/debt-solutions/debt-relief-vs-bankruptcy/", achieve: "https://www.achieve.com/learn/debt-basics/debt-relief-vs-bankruptcy" },
      { query: "bankruptcy or debt relief", fdr: "https://www.freedomdebtrelief.com/debt-solutions/debt-relief-vs-bankruptcy/", achieve: "https://www.achieve.com/learn/debt-basics/bankruptcy-or-debt-relief-7-questions-to-help-you-decide" },
      { query: "debt relief vs consolidation", fdr: "https://www.freedomdebtrelief.com/learn/debt-solutions/debt-settlement-vs-debt-consolidation/", achieve: "https://www.achieve.com/learn/debt-basics/debt-relief-vs-debt-consolidation-comparison" },
      { query: "debt relief vs debt management plan", fdr: "https://www.freedomdebtrelief.com/learn/debt-solutions/how-do-debt-management-plans-work/", achieve: "https://www.achieve.com/learn/debt-basics/debt-relief-vs-debt-management-plan" },
      { query: "debt relief pros and cons", fdr: "https://www.freedomdebtrelief.com/debt-solutions/debt-settlement-pros-and-cons/", achieve: "https://www.achieve.com/learn/debt-basics/debt-relief-pros-and-cons" },
      { query: "debt relief myths", fdr: "https://www.freedomdebtrelief.com/learn/debt-relief/debt-relief-myths-realities/", achieve: "https://www.achieve.com/learn/debt-basics/6-common-debt-relief-myths-busted" },
      { query: "medical bills and debt relief", fdr: "https://www.freedomdebtrelief.com/debt-relief/medical-debt-relief/", achieve: "https://www.achieve.com/learn/debt-basics/can-medical-bills-be-cleared-through-debt-relief" },
      { query: "tax on forgiven debt", fdr: "https://www.freedomdebtrelief.com/learn/debt-solutions/debt-settlement-taxes/", achieve: "https://www.achieve.com/learn/debt-basics/tax-on-debt-relief" },
      { query: "debt relief lawyer", fdr: "https://www.freedomdebtrelief.com/learn/credit-card-debt/credit-card-debt-lawyer/", achieve: "https://www.achieve.com/learn/debt-basics/debt-relief-lawyer" },
      { query: "sued while in a debt relief program", fdr: "https://www.freedomdebtrelief.com/learn/credit-card-debt/sued-for-credit-card-debt/", achieve: "https://www.achieve.com/learn/debt-basics/can-debt-collectors-sue-you-while-you-are-in-a-debt-relief-program" },
      { query: "hardships that qualify for debt relief", fdr: "https://www.freedomdebtrelief.com/glossary/f/financial-hardship/", achieve: "https://www.achieve.com/learn/debt-basics/financial-hardships-that-qualify-for-debt-relief" },
    ],

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
  S27: {
    conflict: "Achieve Article has headline + author, no datePublished. FDR Article is complete on dates but competes with FAQPage.",
    rows: [
      {
        brand: "achieve",
        url: "https://www.achieve.com/learn/achieve-insights/7-smarter-debt-steps-to-start-the-new-year",
        h1: "7 smarter debt steps to start the New Year",
        canonical: "https://www.achieve.com/learn/achieve-insights/7-smarter-debt-steps-to-start-the-new-year",
        extra: "Article author Elina Tarkazikis · missing datePublished, dateModified, mainEntityOfPage",
      },
    ],
  },
  S28: {
    conflict: "Keyword <title>/og:title vs question H1/headline on the same FDR learn URL.",
    rows: [
      {
        brand: "fdr",
        url: "https://www.freedomdebtrelief.com/learn/credit-card-debt/401k-loan-credit-card-debt/",
        h1: "Is it a Good Idea to Use a 401(k) Loan to Pay Off Your Credit Card Debt?",
        canonical: "https://www.freedomdebtrelief.com/learn/credit-card-debt/401k-loan-credit-card-debt/",
        extra: "title/og: 401(K) Loan To Pay Off Your Credit Card Debt | Freedom Debt Relief",
      },
    ],
  },
  S29: {
    conflict: "NewsArticle author is the Organization node, not a Person.",
    rows: [
      {
        brand: "fdr",
        url: "https://www.freedomdebtrelief.com/newsroom/freedom-debt-relief-settles-over-20-billion-dollars-in-consumer-debt-wins-usa-today-america-best-customer-service-2025-award/",
        h1: "Freedom Debt Relief settles over $20 billion in consumer debt, wins USA Today’s America's Best Customer Service 2025 award",
        canonical:
          "https://www.freedomdebtrelief.com/newsroom/freedom-debt-relief-settles-over-20-billion-dollars-in-consumer-debt-wins-usa-today-america-best-customer-service-2025-award/",
        extra: "author @id → organization/freedom-debt-relief",
      },
    ],
  },
  S30: {
    conflict: "datePublished 2023-01-23 vs dateModified 2026-03-10. No visible <time>. Achieve insights have no dates.",
    rows: [
      {
        brand: "fdr",
        url: "https://www.freedomdebtrelief.com/learn/credit-card-debt/401k-loan-credit-card-debt/",
        h1: "Is it a Good Idea to Use a 401(k) Loan to Pay Off Your Credit Card Debt?",
        canonical: "https://www.freedomdebtrelief.com/learn/credit-card-debt/401k-loan-credit-card-debt/",
        extra: "datePublished 2023-01-23 · dateModified 2026-03-10 · ~1,142 days",
      },
    ],
  },
  S31: {
    conflict: "Article.image @id is the debt-relief product hero, not this learn URL.",
    rows: [
      {
        brand: "fdr",
        url: "https://www.freedomdebtrelief.com/learn/credit-card-debt/401k-loan-credit-card-debt/",
        h1: "Is it a Good Idea to Use a 401(k) Loan to Pay Off Your Credit Card Debt?",
        canonical: "https://www.freedomdebtrelief.com/learn/credit-card-debt/401k-loan-credit-card-debt/",
        extra: "image @id https://www.freedomdebtrelief.com/debt-relief/#primaryimage",
      },
    ],
  },
};
