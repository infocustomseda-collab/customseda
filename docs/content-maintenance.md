# Content after the completed import

The shop uses native EmDash content and media. The retired source importer, endpoint, inventory, reports and source ID fields are no longer needed; earlier tracked versions remain in Git history. Public product, collection, blog, page and policy paths remain unchanged.

## Model cleanup

`pnpm cms:model`, with the local development server running, applies `customseda.catalog-cleanup.v1`. This removes `shopify_id` and `shopify_source` through EmDash's schema registry, scrubs those keys from revision snapshots, deletes the obsolete import options, and renames the Site Settings entry to `home` without changing its ID. The same versioned migration is available to deployment tooling, but no remote migration was run for this cleanup.

Create a consistent local D1 backup before applying this removal to another existing database. Field deletion removes stored source values. The cleanup leaves editorial content, references, galleries, prices and publication states intact. Incomplete native drafts remain possible; catalog write and publication validation still enforce supported sizes.

The local pre-cleanup backup is ignored under `backups/before-retire-import-*.sqlite`. Old recovery backups are intentionally retained outside the working source tree.

## Original media

See [`assets/originals/`](../assets/originals/README.md). The archive contains the original files and a SHA-256 manifest, separated into product and site images. EmDash continues to manage editable media in R2. Build derivatives remain generated files.

## Privacy policy

[`privacy-policy.md`](privacy-policy.md) records the revised Spanish copy applied to the local `privacy-policy` CMS page. Further editorial changes belong in EmDash; keep this reference document aligned when changing the approved policy. The page remains a local draft and retains its existing public URL. The obsolete initial template was replaced in the base row as well as the current draft; one unreferenced revision of that template was removed after the new draft was saved. The pre-cleanup backup retains the old policy for recovery.

The policy describes the implemented buy-now flow: Stripe Checkout collects customer/payment and delivery information, Stripe Dashboard manages orders, and local payment-event rows contain identifiers/statuses. It also describes the popup dismissal stored in the browser and the absence of advertising/analytics integrations in the current implementation. Astro and EmDash are software used by the site, not separate hosted services receiving visitor data merely because those tools are installed.

The user confirmed retaining the existing controller/contact details: Seda, Calle Benecharo, 35009, Las Palmas, España; info.customseda@gmail.com. No fuller legal identity or address has been invented. Recheck the policy if actual services, data handling, provider configuration or business details change before launch.

Sources consulted on 2026-10-27: [AEPD information duties](https://www.aepd.es/derechos-y-deberes/conoce-tus-derechos/derecho-de-informacion), [Cloudflare privacy](https://www.cloudflare.com/privacypolicy/) and [Stripe privacy](https://stripe.com/privacy).

## Staging and launch

This cleanup is local only. Phase 7 must define and verify transfer of the approved EmDash content and original media to staging. Do not restore the obsolete source importer or copy the entire local database to production.

## Catalog workbook workflow

### Export to Excel

Save `EMDASH_TOKEN` in the existing ignored `.env` file. Use an EmDash token with the `content:read` scope from an account that can read drafts and taxonomy terms. Reserve the remote environment files for Worker secrets. When configuring the token, uncomment the empty `EMDASH_TOKEN=` line in `.env.example` so the inventory check recognizes the key. The export command reads the token directly from `.env`.

```sh
mkdir -p backups
pnpm catalog:export --url https://customseda.com --output backups/catalog.xlsx
```

The command reads the five Catálogo content types and writes `Products`, `Collections`, `Materials`, `Colors`, and `Sizes`. The `Categories` sheet holds native taxonomy terms with paths such as `Mujeres → Top`. The `Size Guides` sheet is a reference list for the product dropdown.

Relationship columns use Excel Data Validation dropdowns backed by the exported titles and category paths. Select a data cell such as `Products → Collection` to see the dropdown. The `Bundle Components` and `Material Sizes` sheets use one row per link, with a position to preserve order. Size dropdowns use the `Reference Name` column, which adds locale information when titles repeat. Re-export to refresh the lists from EmDash. Keep each entry's ID and Revision for matching and conflict detection in a future import.

Pass `--overwrite` to replace an existing workbook after the new export is ready. Keep the workbook private if it contains drafts.

The `Gallery` column contains JSON with the published and pending draft gallery data where available. Its media IDs reference original images stored in EmDash. Use the media archive to back up the image files.

### Preview catalog imports

Edit a copy of a fresh export, close it in Excel, and run:

```sh
pnpm catalog:import:preview --url https://customseda.com --input backups/catalog.xlsx
```

The preview reads the five Catálogo sheets, native Categories, and the ordered Bundle Components and Material Sizes sheets. It compares workbook values with EmDash and reports proposed creates, updates, unchanged entries, and row errors. Use plain text, numeric euro prices, Excel booleans for switches, and Portable Text JSON arrays for Description. Size Guides serves as a reference list. Product Gallery and Collection Image are backup columns.

- Keep the exported ID, slug, locale, and revision metadata on existing entries. The hidden category revision columns protect changes to category terms and assignments. Use a fresh export when editing either.
- For new entries, leave IDs and revisions blank. Use a lowercase slug, locale `es`, and a title or category name. Products need a price, individual products need a collection, and bundles need at least two individual components. Collections need a code and sizes need a label.
- Blank content cells preserve existing values. A missing entry row leaves that entry alone. Relationship cells use the titles, size reference names, or category paths shown in the export. An unknown or ambiguous choice is a row error.
- For Bundle Components and Material Sizes, include the matching owner row with its revision. A supplied set replaces that owner's selection in Position order. To clear a selection, leave one row with the owner filled in and both the target and Position blank. Omitting all the link rows for an owner preserves its current selection.
- Treat Categories.Path and Sizes.Reference Name as derived labels. Use Parent to select a category's parent and Category to assign an existing or newly listed category. A blank Parent on a new category creates a top-level term. Blank category cells on existing entries preserve the assignment.

### Apply a reviewed plan

The preview uses GET requests and prints a `Plan: sha256:…` value when the workbook has changes and zero errors. Check the proposed changes and pass that exact value to apply:

```sh
pnpm catalog:import:apply --url https://customseda.com --input backups/catalog.xlsx --confirm 'sha256:<plan-from-preview>'
```

Use an EmDash token with content write access for apply. The command recomputes the plan against current EmDash data and stops if it differs. Content creates and updates use the native draft workflow. Gallery, Collection Image, and publication state stay under CMS control.

Category definitions and assignments take effect immediately through EmDash's taxonomy API. Apply those plans only with the additional `--allow-taxonomy` flag and taxonomy permissions. Pause concurrent taxonomy editing while applying because these API operations have a read-before-write check. Published category assignments must also satisfy the catalog's publication rules.

The API handles one entry at a time. If a request fails, apply stops and reports completed writes and IDs. Review those entries in EmDash, export a fresh workbook, and reapply only the remaining edits before generating a new plan. This also lets you recover the assigned IDs for any rows already created.
