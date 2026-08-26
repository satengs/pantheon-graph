export type RecCategory = "identity" | "ownership" | "wrong-shelf" | "same-page" | "ai-recipe";

export type RecItem = {
  codes: string[];
  category: RecCategory;
  title: string;
  today: string;
  hurt: string;
  fix: string;
  serp: string;
  ai: string;
};

export const CATEGORIES: Record<
  RecCategory,
  { label: string; blurb: string; color: string }
> = {
  identity: {
    label: "Who we are",
    blurb: "One company, two brands. Search and AI must keep them as siblings, not twins.",
    color: "var(--color-accent)",
  },
  ownership: {
    label: "Who owns the word",
    blurb: "Each glossary term and product name should have one home. Two self-canonical pages is two owners.",
    color: "var(--color-danger)",
  },
  "wrong-shelf": {
    label: "Wrong product, wrong brand",
    blurb: "Lending lives on Achieve. Relief lives on FDR. Cross-stocked URLs teach Google the brands are interchangeable.",
    color: "var(--color-achieve)",
  },
  "same-page": {
    label: "One page, two products",
    blurb: "Relief and settlement, HEL and HELOC, or cloned outlines on the same URL. The page cannot rank for both.",
    color: "var(--color-fdr)",
  },
  "ai-recipe": {
    label: "What AI copies",
    blurb: "JSON-LD, titles, authors, dates, and images are the recipe ChatGPT and AI Overviews quote. If they conflict, the model guesses.",
    color: "var(--color-warn)",
  },
};

export const RECS: RecItem[] = [
  {
    codes: ["S06", "S05", "S13"],
    category: "identity",
    title: "Say the corporate relationship once, then stop mixing the brands",
    today:
      "Achieve and FDR look like two companies that happen to share a parent. Organization @id and ratings sometimes point at the wrong brand.",
    hurt: "Knowledge Graph may merge or split them at random. Reviews and NAP attach to the wrong logo.",
    fix: "One Organization for the parent with sameAs to both brand sites. Each brand keeps its own @id. Ratings never borrow the sibling’s node.",
    serp: "Brand sitelinks stay on the right domain. Review stars do not leak across brands.",
    ai: "“Is FDR part of Achieve?” gets a clean yes, without mixing HELOC into a debt-settlement answer.",
  },
  {
    codes: ["S01", "S04", "S22"],
    category: "ownership",
    title: "One owner per glossary slug and per /debt-relief",
    today:
      "219 terms exist on both sites with the same H1. Each page canonicals to itself. Both brands also publish /debt-relief.",
    hurt: "Google cannot pick a winner, so neither page is trusted. AI Overviews hedge or cite both.",
    fix: "FDR owns settlement and relief terms. Achieve owns APR, HEL, HELOC, credit. Non-owner 301s or canonicals to the owner and drops the DefinedTerm.",
    serp: "Featured snippet for “what is debt relief” is FDR. “What is a HELOC” is Achieve. Cannibalization ends.",
    ai: "ChatGPT and Perplexity quote one definition, with the right brand as source.",
  },
  {
    codes: ["S03", "S23", "S24", "S25"],
    category: "wrong-shelf",
    title: "Stop stocking the other brand’s products",
    today:
      "Achieve still has debt-relief URLs. FDR still has HELOC and lending glossary terms. Some Achieve HEL pages are the wrong product.",
    hurt: "Searchers land on a brand that cannot serve them. Bounce and “did you mean the other site?” in AI answers.",
    fix: "301 FDR lending → Achieve. 301 Achieve relief → FDR. Keep a short explainer with a visible handoff, not a clone.",
    serp: "Query “FDR HELOC” still finds Achieve HELOC, via a redirect, without a thin FDR ranking.",
    ai: "Assistants stop recommending FDR for home equity and Achieve for settlement.",
  },
  {
    codes: ["S02", "S09", "S10", "S11", "S12"],
    category: "same-page",
    title: "Split products that currently share a URL or an outline",
    today:
      "FDR treats debt-relief and settlement as aliases. HEL and HELOC share H2 blocks. Breadcrumbs and NMLS copy leak across products.",
    hurt: "The page is “about everything,” so it ranks for nothing specific. Compliance copy attaches to the wrong product.",
    fix: "Distinct H1, schema type, and outline per product. Breadcrumbs stay inside one family. NMLS only on licensed lending pages.",
    serp: "Settlement ranks for settlement. Relief ranks for relief. HELOC queries stop pulling HEL pages.",
    ai: "Step-by-step answers no longer mix settlement fees into a HELOC explanation.",
  },
  {
    codes: ["S07", "S08", "S21", "S26", "S27", "S28", "S29", "S30", "S31"],
    category: "ai-recipe",
    title: "Make the machine-readable page match the human page",
    today:
      "Titles fight H1s (401k vs 401(k)). Articles miss dates and authors. Images @id the wrong path. Many Achieve glossary pages have no JSON-LD at all.",
    hurt: "AI Overviews copy the schema, not the visible H1. Dates look stale. Images attach to the wrong article.",
    fix: "One title, one H1, one headline in schema. Required Article fields. Image @id equals the file URL. Add JSON-LD where it is missing.",
    serp: "Article rich results, correct dates in search, and images in Discover/AI snapshots.",
    ai: "Quoted title, author, and date match the page people see. Fewer “according to Achieve” errors on FDR content.",
  },
];

export const IDEAL_TREE = {
  parent: "Achieve (parent)",
  brands: [
    {
      id: "achieve",
      name: "Achieve",
      role: "Lending and credit",
      products: ["HELOC", "Home equity loan", "Personal loans", "Consolidation"],
      glossary: "APR, HELOC, credit, origination",
    },
    {
      id: "fdr",
      name: "Freedom Debt Relief",
      role: "Debt relief specialist",
      products: ["Debt relief", "Settlement"],
      glossary: "Settlement, hardship, collections, relief",
    },
  ],
};

export const SERP_WINS = [
  { label: "Featured snippets", detail: "One brand owns each definition. Snippets stop swapping week to week." },
  { label: "No cannibalization", detail: "FDR and Achieve no longer compete for the same slug in the same query." },
  { label: "Rich results", detail: "Honest Article/Product schema unlocks dates, authors, and product attributes." },
  { label: "Sitelinks", detail: "Each domain’s sitelinks reflect what it actually sells." },
];

export const AI_WINS = [
  { label: "AI Overviews", detail: "Google’s overview cites one owner instead of blending both brands." },
  { label: "ChatGPT / Perplexity", detail: "Answers name the right brand for lending vs relief." },
  { label: "Knowledge Graph", detail: "Parent sameAs, two brand entities, no stolen ratings." },
  { label: "Voice and assistants", detail: "“Who should I call for a HELOC?” resolves to Achieve, not FDR." },
];
