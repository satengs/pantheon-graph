# Guardrails

These behaviours were signed off by Satenik on **2026-10-19** with the release of `3a649e4` to production.
They are locked. A change that breaks one turns its check red in [`.github/workflows/guard.yml`](.github/workflows/guard.yml).
To change a locked behaviour, get a new sign-off first, then update the guard in the same PR.

| # | Locked behaviour | Why it is locked | Check (job name) | Guarded by |
| - | --- | --- | --- | --- |
| 1 | **Click map.** Left-click only selects. Right-click opens the inspector: a page shows its URL and live gate, a product shows its identity and children. A real double-click expands or collapses a hub. Two slow single clicks never toggle. Dragging a hub moves the hub with its pages, not the canvas. Dragging empty canvas pans. | Accidental toggles on single clicks failed QA on #36 (fixed in 24c7ef8). | `guard: click map` | `tests/e2e/click-map.e2e.mjs` |
| 2 | **Page links S01/S06 only.** The only page-to-page family edges come from S01 and S06. Cross-brand L2 issues show only as one brand-to-brand arc per brand pair. | Keeps the canvas readable. Other rules show on their hubs, not as page spaghetti. | `guard: page links S01/S06 only` | `tests/guard/page-links.test.ts`, `tests/e2e/page-links.e2e.mjs` |
| 3 | **One issue source.** The graph bar, the Issues header and the Gate show identical C/H/M/L totals, all derived from the same family rules. Each issue has the same severity in every view. Live-HTML checks are listed apart and never counted. The release snapshot is **C8 H10 M3 L0**. | Diverging totals between views were the #35 QA blocker. | `guard: one issue source` | `tests/guard/one-issue-source.test.ts`, `tests/e2e/one-issue-source.e2e.mjs` |
| 4 | **Evidence labels.** Every canvas evidence tag and the legend text come from `evidenceLabel()` (`src/lib/graph/evidence-label.ts`), e.g. `Evidence 84 · 4 critical` / `Evidence 22 · unrated`. `undefined` and `unknown` never reach the DOM, including with a legacy `evidence.json`. | "Evidence 84 · 80 unknown" / "5 undefined" failed QA on #36. | `guard: evidence labels` | `tests/guard/evidence-labels.test.ts`, `src/lib/graph/evidence-label.test.ts` (legacy-key test), `tests/e2e/evidence-labels.e2e.mjs` |
| 5 | **Expand on issues only.** On a cold load only products with an open issue are expanded. Issue-free hubs (e.g. all 7 Bills products) load collapsed and show their page count. **Reset layout** re-applies this rule and collapses nothing else. | The cold view must lead with what needs attention. | `guard: expand on issues only` | `tests/guard/expand-on-issues.test.ts`, `tests/e2e/expand-on-issues.e2e.mjs` |
| 6 | **No pink / no stripe cards.** No pink, fuchsia or rose Tailwind classes. No magenta-range hex colours (hue 290–345°). No `border-l-*` accent stripes on rounded cards. | Design direction for the studio UI. | `guard: no pink / no stripe cards` | `scripts/guard-ui-style.mjs` (static scan of `src/`), `scripts/guard-ui-style.test.mjs` |

## How the e2e checks sign in

**No test-only login, seed or bypass exists.** The e2e checks run against a locally built production bundle
(`npm run build` then `npm run preview`, on `http://127.0.0.1:8081`). They sign in through the app's real
`/login` form with the built-in demo credentials (`admin` / `123`), exactly as a person would on production.
The build needs no `DATABASE_URL`: migrations are skipped and the app falls back to PGLite.
Because no extra code path was added, nothing test-only can be switched on in production.

## Run locally

```bash
npm ci
npm run guard:unit                     # vitest: tests/guard/**
npm run guard:style                    # pink / stripe static scan
npx playwright install chromium        # once
npm run build && npm run preview &     # serves 127.0.0.1:8081
npm run guard:e2e                      # all e2e guards (GUARD_BASE overrides the URL; CHROME_PATH uses a local Chrome)
git checkout -- public/data/build-metrics.json src/data/build-metrics.json   # the build rewrites these
```

## Snapshots

Two assertions pin today's data and will need updating, with sign-off, when the content changes:
the **C8 H10 M3 L0** totals and the parent tag **Evidence 84 · 4 critical**.
Everything else checks invariants (views agree, no stray strings), not numbers.
