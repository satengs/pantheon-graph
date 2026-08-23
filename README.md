# Origin

Content graph studio for [Freedom Debt Relief](https://www.freedomdebtrelief.com/) and [Achieve](https://www.achieve.com/). It stops entity confusion, keyword stealing, glossary duplicates, and outline twins before they ship.

Live crawl snapshot in this repo: **1,159 FDR URLs** and **1,114 Achieve URLs**.

## What it does

Two validation layers:

| Layer | Scope | Checks |
| --- | --- | --- |
| **L1** | A page vs its own graph node | Topic, tone token ratio, structure, schema type-per-URL, required `LoanOrCredit` properties, claims |
| **L2** | Across brands and products | Entity mix-ups, keyword ownership, glossary Jaccard twins, outline twins |

The canvas is an interactive graph of brands, products, glossary hubs, conflict edges, and S01–S20 issue nodes. **Explode pages** expands a hub into live URLs. The inspector binds every issue to a citation (quote, location, why it is real) and opens the live page.

## Backlog S01–S20

| ID | Title |
| --- | --- |
| S01 | One canonical owner per glossary slug |
| S02 | Stop aliasing “debt-relief” as settlement |
| S03 | Point Achieve HELOC glossary links at `/heloc` |
| S04 | L2-GLOSS Jaccard similarity gate |
| S05 | Stable Achieve Organization `@id` |
| S06 | `sameAs` cross-links FDR ↔ Achieve |
| S07 | Enforce type-per-URL in schema |
| S08 | Required `LoanOrCredit` properties |
| S09 | Split H2 outlines for HEL vs HELOC |
| S10 | Remove duplicate use-case blocks |
| S11 | Fix personal-loan breadcrumb hierarchy |
| S12 | Scope NMLS and fee language by product |
| S13 | Bind `AggregateRating` to the correct brand `@id` |
| S14 | Generate MCP shorts from graph nodes |
| S15 | Tone token ratio validation |
| S16 | Pre-publish validation gate |
| S17 | Conflict dashboard for L2 issues |
| S18 | Version the graph with crawl timestamps |
| S19 | Citation system (issue → paragraph) |
| S20 | Filter issues by domain and product with impact |

S14–S20 are implemented in this studio. S01–S13 are content/schema work, each with a live URL, reason, fix, and citation.

## Ownership rules (canonical)

| Product | Owner |
| --- | --- |
| Debt relief, settlement | Freedom Debt Relief |
| HELOC, home equity loan, personal loans | Achieve |
| Glossary slug | One owner; the other is a `sameAs` stub |
| Organization `@id` | Stable, never path-relative |

## Stack

- React 19, TanStack Start / Router / Query
- SVG content graph
- Zustand studio state
- Tailwind v4
- Seeded crawl JSON (`src/data/crawl.json`) from live sitemaps

Auth and a database are intentionally off. The graph is a versioned snapshot plus an optional live recrawl.

## Scripts

```bash
npm install
npm run dev        # 0.0.0.0:8080
npm run build
npm run typecheck
```

`Live crawl` re-fetches both sitemap indexes. `Fetch live PageSpeed` calls Google’s PageSpeed API for the selected URL (rate-limited; seeded scores always show).

## Data

- `src/data/crawl.json` — compact page catalog, glossary overlap (130 shared slugs), near-duplicates, `crawledAt`
- `src/data/issues.ts` — S01–S20 with citations and origin/page acceptance (PSI, CWV, Cloudflare HIT/MISS/DYNAMIC)
- `public/data/crawl.json` — same snapshot for export

## Git

This repo is ready to push:

1. Create an empty GitHub repository.
2. `git init` (if needed), `git add .`, `git commit -m "Origin content graph studio"`
3. `git remote add origin git@github.com:<you>/origin.git`
4. `git push -u origin main`

Do not commit `.env` files. PageSpeed and sitemap fetches need no secrets.
