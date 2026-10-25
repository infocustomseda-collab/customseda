# Local Shopify import implementation plan

User instruction: “Just import what is now on the website.” Execute inline on master, local D1/R2 only.

## Decisions

- Use the current public catalog and the audited source IDs; refresh it before import.
- Import all 16 catalog records as drafts through native EmDash runtime handlers. Call the full catalog validator and report its findings; incomplete draft references remain subject to unchanged publication validation.
- Preserve exact source options, original HTML, image order, metadata and availability in an optional JSON source field. Never invent sizes or silently reconcile set/component differences.
- Add the optional source field through a separate, retryable application migration; preserve existing schema and content.
- Use Spanish content locale. Keep initial lookup IDs intact.
- Download original media, upload through the CMS into local R2, and retain a restartable source-to-media map. Do not use Shopify media at runtime.
- Import supporting public pages and the original image-based size guide. Preserve their existing copy; editorial/legal revisions remain later work.
- Leave public pages, checkout, production/staging, and the approved visual design untouched.

## Task 1: Draft import boundary and source preservation

Files: `src/lib/cms/shopify-import.ts`, `src/lib/cms/import-route.ts`, `astro.config.mjs`, `tests/shopify-import.test.mjs`.

- [x] Test missing-size draft persistence, unchanged publish rejection, source identity collision protection, and repeat import without duplicates using the real EmDash runtime.
- [x] Add versioned optional source fields and a development-only, loopback-only, same-origin administrator endpoint using native runtime handlers.
- [x] Read source keys from stored entries on retry; never overwrite existing editorial work.

## Task 2: Local importer and media

Files: `scripts/import/shopify-plan.mjs`, `scripts/import/shopify-local.mjs`, `tests/shopify-plan.test.mjs`, `package.json`.

- [x] Test exact sizes/default-option preservation, integer prices, independent source set options, gallery ordering and untrusted source URL rejection.
- [x] Implement a dry-run default, explicit apply mode, localhost-only target, media download/cache/upload, and per-record reporting.
- [x] Back up local D1 before writes and run the import. Retry and reconcile counts, source IDs, prices, sizes, image order, media bytes and no duplicate records.

## Task 3: Verification and handoff

- [x] Run `pnpm test`, `pnpm typecheck`, `pnpm build` and inspect the local CMS/read APIs.
- [x] Document actual imported counts, draft blockers, source-to-target URLs, rerun behavior and commands in `docs/import/`.

## Execution ledger

Ruling: user opted to import the website as it stands, superseding requests for another export or size clarification. Missing source values remain missing, drafts retain validator findings, and no commerce rules are relaxed.

Ruling: EmDash rejects a schema-required missing size reference even for a draft. The versioned source migration makes the schema field optional for native draft staging; existing catalog REST and publication policies still enforce at least one valid size. This allows the two size-less source records to be retained without inventing sizes.

Ruling: publish the six imported color lookup labels locally so draft catalog references can resolve normally. All catalog entries, supporting pages, the size guide and homepage settings remain drafts.

Verification finding: dependency protection incorrectly validated a nonexistent live selection on an unpublished Conjunto and blocked valid draft-component edits. A real-runtime regression reproduced it; skip the live branch for unpublished sets while retaining validation of their current draft selection and all published-set protections.

Final verification: 45/45 tests pass; typecheck has zero errors/warnings/hints; production build succeeds with the existing upstream admin chunk-size advisory. Local API verification confirms 16 catalog drafts, 15 supporting records, exact source options/prices/descriptions/references/gallery order, 106 source media URLs / 95 distinct R2 files, and SHA-256 equality for every local media blob. Retry retained all 31 records with zero duplicate creates. Independent focused review found no actionable issue; the later draft-dependency finding was reproduced RED and fixed GREEN with the full suite passing.
