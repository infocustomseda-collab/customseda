# Local Shopify import

The merchant authorized importing the current public website as it stands, without waiting for another export or inventing missing sizes. The Shopify storefront and all staging/production resources remain unchanged.

## Commands

With `pnpm dev` running and the catalog model installed (`pnpm cms:model`):

```sh
pnpm import:shopify --dry-run
pnpm import:shopify --apply
pnpm import:shopify:verify
```

The dry run reads the audited inventory and writes no CMS data. Apply refreshes public product JSON, retains original descriptions/options/variants, downloads original media, and creates local Spanish drafts. Only `http://localhost:4321` is targeted. Authentication uses EmDash's local development session; no credential is printed or saved. The import route requires DEV mode, a loopback hostname, an administrator, the same origin and the CMS request header; deployed builds return 404.

Back up local D1 before the first apply. The executed import's consistent SQLite backup is in ignored `backups/before-shopify-import-20261025-004442/`, and passed `PRAGMA integrity_check`. This is a local development backup, not a production deployment mechanism.

## Data and restart behavior

- Individual pieces are in Products; sets are in Conjuntos, each retaining its own source price and gallery. Source handles and Shopify IDs are unchanged.
- All 16 catalog entries are drafts. Six color labels are published lookup records so references resolve; supporting pages, the size guide and homepage settings remain drafts.
- The optional `shopify_source` JSON field retains original HTML, all variant IDs and options, source prices/availability, gallery metadata and public-page introductions. Source set options remain independent of piece options in this record; the current commerce model has not been extended to offer set-only sizes.
- Curve Caoba and Flow Caoba retain an empty size selection because Shopify exposes only `Default Title`. They cannot publish until valid supported sizes exist. No global size defaults were substituted.
- Fuego's proposed components retain the distinct source colors Rojo and Rojo Mate. The set remains a draft and its same-color validation finding is reported rather than changing either label.
- Set relationships are inferred from the audited public names, colors and galleries. The original mapping evidence is retained. Set-only XL / omitted XS differences are preserved in source metadata and require later publishing/checkout treatment.
- Imported gallery alt text uses existing source text when present, otherwise a factual title/color/image-number fallback. The missing original alt values remain in the source JSON for editorial review.
- Descriptions become editable plain Portable Text paragraphs; the complete original HTML remains in the source field. Supporting page text and images are copied without rewriting shipping, legal or legacy collection copy.
- Source identities are recorded in CMS options and checked against each entry's source field. An exact retry retains existing entries without overwriting editorial changes. A slug collision with another source ID fails. Existing draft colors are not automatically published on retry.
- Original media downloads and the source-to-local-media map are cached in ignored `backups/shopify-import-local/`. EmDash content hashing deduplicates identical bytes, including copies with different Shopify names. Confirmation checks the installed CMS's hash format; verification independently downloads every distinct local blob and checks its full SHA-256 against the originals.
- Cached media IDs are checked against the CMS before reuse. A failed run can be retried. If a previously mapped content entry has been removed, the importer stops for inspection instead of creating a silent replacement.

The optional source fields and incomplete-draft size support are installed by versioned application migration `customseda.shopify-source.v1`, separate from EmDash core and catalog v1 migrations. EmDash 1.3.1 requires manual schema metadata migration to change the `required` flag; only the size field metadata is changed. Catalog rows and relationships are written through native handlers, with full `validateCatalogWrite` findings captured. Existing REST and publication policies still require a valid size selection. This local-only migration must be included in an explicit future remote schema/import workflow before staging replay; do not copy the local database to production.

`shopify_source.validation_errors` records findings at the first import, when some lookup values might still have been drafts. `report.json` recalculates current findings on a retry. The verifier checks the actual CMS records and references rather than treating either historical list as authoritative.

## Results and boundaries

See [verified local result](shopify-local-result.json) for final counts and catalog identities, and [source URL mapping](shopify-url-map.json) for current CMS patterns versus the preferred retained public paths. The preferred paths are inputs to phase 4; no redirects or public shop routes have been implemented yet.

Public pagination/sitemap coverage establishes the current public catalog only. Draft/private Shopify data was not requested or inferred. Original source responses, downloaded originals, local target IDs, rerun report and byte-verification evidence remain in ignored local artifacts. The checked-in source audit remains the historical inventory; the apply-time refreshed snapshot is `backups/shopify-import-local/source.json`.

The import also reproduced and fixed a catalog dependency bug: an unpublished set has no live reference selection to validate, so component editing now checks that set's current draft selection without inventing missing published-component errors. Published-set and draft-selection protection remain in place, covered by real-runtime tests.
