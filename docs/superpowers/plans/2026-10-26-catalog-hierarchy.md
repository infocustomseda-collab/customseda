# Catalog hierarchy implementation plan

> **For agentic workers:** Use superpowers:executing-plans for inline execution. The user approved critique scope B and removed size filtering on 2026-10-26.

**Goal:** Make category navigation primary, keep refinements quiet and recoverable, and identify each item clearly.
**Architecture:** Preserve Astro server-rendered cards and client enhancement. Native details hosts color/availability filters; pure helpers normalize URL state and carry compatible values to category links.
**Tech Stack:** Astro, TypeScript, existing plain CSS tokens; local D1/R2 only.
**Spec:** Approved `.impeccable/critique/2026-10-26T10-55-19Z__src-pages-collections-handle-astro.md`, with size filtering removed entirely per user.

## Global constraints
- Preserve approved Seda identity, merchant titles, product-detail sizing and checkout.
- No deployments, new dependencies, Tailwind, or CMS writes.
- Work in the user's current feature/impeccable_bikini checkout.

## Review focus
- Legacy talla queries cannot filter results invisibly.
- Category switches preserve compatible colors, availability and sorting.
- Active refinements remain visible and removable with panel closed.
- Empty results recover and controls work by keyboard.
- Four category links fit phone widths and products appear earlier.

## Tasks
- [x] Update catalog tests first: color/availability AND/OR, ignored legacy size queries, compatible category URL state, factual card metadata. Run and observe failures.
- [x] Update filters.ts and catalog.ts, then verify focused tests.
- [x] Update collection route, CatalogBrowser, ProductCard and catalog CSS: underlined category links, native disclosure toolbar, active filter removal/reset, factual metadata. Keep no-JS catalog usable.
- [x] Run full tests, typecheck and local draft preview build. Inspect desktop/mobile and interaction states in one browser batch; fix defects together, confirm at most once.
- [x] Run Impeccable detector once on changed markup; record outcome and stop.

## Verification
- 175 tests pass; typecheck reports 0 errors/0 warnings and 2 existing hints.
- Local draft preview build passes; 40 static pages validated.
- Impeccable detector: zero findings across the three changed markup targets.
- Browser checks at 1440, 390 and 320px: no narrow-width overflow, categories stay on one row. At 390px the first products start at ~379px (previous ~500px); desktop ~481px (previous ~633px).
- Keyboard Enter/Tab/Space/Escape, chip removal focus, compatible category color/sort carry, active summary/reset, and ignored legacy talla query verified. Browser console had no errors.
- Independent code review: no actionable findings. No deployment, CMS writes, commit or push performed.

## Follow-up: category query navigation
User requested category=tops/todos on the same catalog page, with in-place filtering and reordering. Category links now update the existing grid and browser history. Back/Forward restores state without Astro page swaps; direct query links initialize it. Retained category paths initialize the complete catalog, and named collection pages retain their collection scope. Color/availability/sort state remains selected across categories, including honest empty results.

- [x] Add failing category parsing, filtering and URL tests; implement pure category helpers.
- [x] Wire local category clicks, URL initialization and popstate; verify no page/grid replacement.
- [x] Run tests/typecheck/build and bounded desktop/mobile browser checks.

Follow-up verification: 176 tests pass; typecheck has 0 errors/0 warnings (2 existing hints); local draft build validates 40 pages. Browser tests confirmed direct category=tops (5 products), conjuntos (5), todos (16), and braguitas (6), color/availability composition and ascending-price sorting. Clicks and Back/Forward retain the exact grid element with zero Astro swaps. Product navigation/back restores category, color and sorting. Desktop 1440px and mobile 390px have no overflow; keyboard Enter changes category. No browser console errors; changed-markup detector scans have zero findings.

Lifecycle ruling: install the scoped catalog history listener before Astro's router module in Shop.astro. Astro delegates prevented preparations to full browser navigation, so cancellation was unsuitable. Only marked catalog history entries are intercepted while that catalog is present; leaving or returning from product pages uses the normal router. Initialize controls on astro:page-load, after the destination URL is set, to preserve departing history entries.

## Follow-up: visible grid motion
User requested outgoing Conjuntos visibly disappear and Tops move up. Motion thesis: a 200ms exit fade, then FLIP translation into the reflowed grid over the existing 600ms slow duration; returning cards fade in over 300ms. Use existing Seda easing/timing tokens and native Web Animations API, with no dependency. Initial render/reduced-motion updates stay immediate. New selections cancel pending animations and stale exit callbacks; disconnect cancels all effects. Tests cover exit-before-reflow, entry/movement, interruption, reduced motion and disconnect cleanup.

Motion verification: all 181 tests pass, including 5 animation lifecycle regressions; typecheck has 0 errors/0 warnings (2 existing hints); local draft build validates 40 pages. Chrome desktop sampling recorded outgoing opacity 0.19 after 100ms, then retained Top movement from y=1154 to y=481 with transforms cleared at completion. Mobile confirmed 600ms movement, rapid category changes settling to 6 Braguitas with no remaining animations, no overflow, and reduced-motion updates with zero animations. No browser console errors.
