# Local catalog model

The current local catalog uses one Products collection, native hierarchical categories, and optional bundle components. This supersedes the separate Conjuntos and Categories content types in the original phase 2 plan.

## Start and update locally

Run `pnpm dev`, then in another terminal run `pnpm cms:model`. Open [local admin](http://localhost:4321/_emdash/admin). Refresh an already-open admin tab after the model changes.

The command authenticates through EmDash's development-only session endpoint, applies `customseda.catalog.v1` to local D1, and regenerates `emdash-env.d.ts` from EmDash's development type-generation endpoint. It uses a fixed localhost origin and accepts no remote target. Existing content and credentials remain intact. Starter Posts are hidden in navigation, not deleted; they may still appear in dashboard counts.

The version marker is written only after success. An interrupted installation can be retried: collections are created before reference fields, application schema is upserted, and initial lookup entries use conflict-skip so existing IDs and editorial changes survive. Future schema changes need a new migration version; do not edit an already-applied version to migrate an existing database.

A pre-migration local SQLite backup is in ignored `backups/`. Normal deployment never copies that database over a remote database.

## Editing catalog entries

| Type | Rules |
| --- | --- |
| Productos | One native Category term at publication. Individual products have one collection, one color and supported sizes from their own category. |
| Bundle products | Products with `bundle` enabled and at least two distinct individual products in ordered `components`. Own title, price, description, gallery and category. Sizes are chosen separately per component. Nested bundles are rejected. No component color or collection matching validation. |
| Categories | Native `category` taxonomy: Mujeres → Top, Braguita, Conjuntos; Hombres → Bañador. Manage under Taxonomies → Category. Assign the specific category; parent filtering includes descendants. |
| Colecciones | Initial record Margarita. Stable code for import and matching. Classification only: not routable, no public listing page. |
| Tallas | Each size belongs to one native Category term (required at publication). Title names size and category (`S · Top`) so the admin list and product picker distinguish them; **Etiqueta** is the shopper-facing size (XS, S, M, L, XL) shown on the storefront, at checkout and in Stripe. Initial records: Top S–XL, Braguita XS–XL, with native slugs `top-s`, `braguita-xs` (no separate code). A size's category cannot change while products use it. |
| Colores | Editable names and optional hexadecimal swatch. Create actual colors during import; no invented colors are seeded. Identified by the native slug, which is also the storefront `?color=` filter value; there is no separate code. |

Prices are integer **EUR cents**: enter `5900` for €59. Availability defaults to Yes. This is an editorial sale switch, with no quantity or inventory tracking. A bundle is purchasable only when it and both components are published and available. At checkout the buyer selects a supported size for each component independently; checkout is phase 5.

The gallery uses EmDash's native reorderable repeater. Each row has a media image, required alternative text, and optional horizontal/vertical focal coordinates from 0 to 1. The first row is the main image. Uploads must be ready before publication; at least one image is required to publish. Drafts can have an empty gallery.

Create and publish lookup entries before products, then create bundle products from those products. A bundle's price is independent of the sum of its component prices. Unavailable components make the bundle unavailable; they do not force deletion or block drafting.

REST saves reject incompatible references, including requests containing only references. Native category assignments may be incomplete while drafting; publication requires one category, and taxonomy edits of published products preserve that rule. Native publish and scheduling policies recheck pending fields and references for all runtime writers, including MCP and plugins. EmDash 1.3.1 does not pass the pending reference payload to its before-save hook: a non-REST writer can stage an invalid selection, but cannot publish it through the runtime. Importers must call `validateCatalogWrite` before saving; do not write catalog SQL directly.

Components cannot be deleted or unpublished while referenced. Turning a referenced component into a nested bundle is rejected. Component colors and collections may differ. Protection covers both live and current draft links; obsolete revision history does not block removal. Unlink or trash the dependent bundle first. Changes to lookup labels/copy are allowed; used size categories and used collection codes are protected.

## Supporting content

- **Pages:** native title/body and SEO, preserving the foundation's existing pages.
- **Size Guides:** reusable rich-text measurement tables and instructions, optionally linked from products.
- **Site Settings:** homepage hero, production copy, contact/social links, and enabled/text/link fields for the announcement bar. Use one settings entry for the site.
- **Popups:** enabled switch, content/image/button, start/end dates, opening delay and dismissal period. The first enabled popup that has not ended shows on public pages after its delay, inside its start/end window, as a native modal dialog (focus trapped, Escape, close button or backdrop dismiss). A dismissal hides it for `dismiss_days` days in that browser (0 = next visit). `pnpm cms:storefront` creates a local draft recreating the source free-shipping popup.
- **Shipping Rules:** initially disabled; zone, country/postal selectors, EUR-cent charge, free-shipping threshold, and delivery copy. The buy-now checkout offers enabled rules and flags addresses outside a rule's postal prefixes; see [checkout](checkout.md). Amounts still need merchant approval.
- **Navigation:** use native EmDash menus. Replace temporary starter links during the URL and content audit.

No sample products, bundles, merchant shipping prices, or source images are imported by the model migration. Initial lookup records retain the current database locale; field labels are Spanish. The import must settle the site's locale configuration before loading the Spanish catalog.

The local Spanish catalog contains 16 Products, including 5 bundles. The 2026-10-27 one-time local migration retained IDs, URLs, draft revisions, prices, galleries and homepage links, assigned native categories, and removed the old Categories and Conjuntos types (including Felpa). No migration script is retained. Fresh database definitions use the new model; this is not a retained upgrade path for other old databases. The completed import has been retired: `customseda.catalog-cleanup.v1` removes original-source fields, revision metadata and import mappings, and renames the settings slug to `home`. Existing content IDs, prices, galleries, relationships and publication states are retained. Native drafts may omit sizes; catalog write/publication validation continues to enforce supported sizes. Original photographs are preserved under `assets/originals/`; see [content maintenance](content-maintenance.md).

## Per-category sizes

`customseda.size-categories.v1` (`src/lib/cms/size-categories.ts`) adds the Etiqueta field and attaches the native category taxonomy to Tallas. On a database that still has the shared XS–XL records, it converts them in place to the Braguita sizes (same IDs, moved to the configured locale), creates the Top sizes from the seed, and repoints Top products' live and pending-draft size selections to them. It then drops the old size code field (the native slug identifies sizes). Pending size drafts stop it before any change. Fresh databases receive categorized sizes from `seed/seed.json` and the migration only records its version. Applied locally on 2026-10-27 (pre-migration backup in `backups/pre-size-categories-2026-10-27/`).

`customseda.collection-pages.v1` makes Colecciones non-routable (no URL pattern, scheduling or SEO). `/collections/<collection>` listings such as `/collections/margarita` no longer exist; `/collections/<handle>` serves only Bikinis and category listings. The Margarita story stays at `/pages/margarita`.

`customseda.color-slugs.v1` drops the Colores code field (and its revision copies); existing slugs already matched the codes, so filter URLs are unchanged.

## Storefront model and homepage content

`customseda.storefront.v1` (`seed/storefront.json`) extends Site Settings with the homepage sections: featured Conjunto (single reference), slideshow (ordered images with alt text and focal point), intro title and rich text, process cards (image, alt, title, text) and a TikTok link. It runs after the catalog model through `applyModelMigrations`, both from `pnpm cms:model` locally and from the deployment runner remotely. It upserts only those fields. The cleanup migration removes the retired source fields separately; the catalog seed no longer creates source IDs.

`pnpm cms:storefront` (local only, with `pnpm dev` running) fills those fields from the approved storefront copy. It also sets the source announcement, the primary and footer menus, and restores the Margarita page's source order (photo rows between paragraphs, final "Ver colección" link). All writes go through EmDash's REST API as drafts. Rerunning leaves already-ordered or editor-changed content alone.

Category filters and navigation come from native terms. `?category=top`, `?category=conjuntos` and parent categories all filter taxonomy membership; `/collections/bikinis` is permanently scoped to Mujeres and its descendants, with no category parameter needed. Its category filters show only descendants (Top, Braguita and Conjuntos); Todo removes the category parameter and shows all products within Mujeres. Query filters cannot expand the page to Hombres. Native category archives use their own fixed scopes. Public pages read content through `src/lib/shop/content.ts`. Production snapshots read published rows only. Development shows drafts with pending revisions and staged references. Category assignments use native taxonomy storage and take effect immediately in the editor; deployed pages update after a new snapshot/build. Scheduled rebuild checks detect category changes alongside menu edits.

## Deployment boundary

`seed/foundation.json` remains the small runtime setup seed. `seed/seed.json` is the versioned catalog definition consumed by the model migration. Bulk catalog schema/content is deliberately not added to the remote setup request. The model HTTP endpoint returns 404 in production builds.

The deployment runner now performs core migrations, then this versioned catalog-model migration, then uploads the Worker. Catalog schema work runs in Node on the deployment machine through Wrangler's D1 remote binding proxy. Each SQL operation is a separate binding call; the complete seed is never executed inside the site's Worker request. A database option lock serializes catalog migrations across machines; the deployment lock also protects this checkout's shared artifacts.

For a separate explicit check or migration, after the official core migration CLI has succeeded:

```sh
pnpm cms:model:remote staging --check
pnpm cms:model:remote staging --apply
```

Use `production` explicitly to select production. Both commands display the selected account/database origin before connecting. Wrangler authentication supplies binding access; no site administrator credentials or local database copy are used. `--check` reads the model marker; `--apply` applies the versioned schema and only missing lookup entries. The normal deployment runner calls the same function under its deployment lock.

`pnpm test:d1` rehearses this orchestration against a disposable local D1 emulator with remote bindings disabled. It covers first apply, retry, version checks, lock cleanup and another process's lock. Actual remote editing/publishing acceptance is still pending; no remote model changes or deployment were performed in this phase. If a catalog migration fails, the runner stops before uploading. Retry after inspecting the failure; never remove a held lock until its owning run has stopped.

The query-budget tests cover focused catalog reads and use at most five terms in compound SELECTs, matching D1. They are not a measurement of deployed Worker CPU or a guarantee that complete admin workflows fit Free-tier limits. Remote editing and publishing require a separate measured acceptance check.

## Verification recorded for 2026-10-27

- 182 unit/runtime tests pass; the isolated local D1 integration test passes.
- Astro typecheck: no errors or warnings (two existing specimen hints). Local draft preview build: 44 static pages checked.
- Native admin tree and storefront filters inspected in the isolated Chrome profile. Top filters five products; migrated bundles retain Incluye.
- Complete local product requests: create 152 ms, category assignment 72 ms, save 116 ms, publish 159 ms. Bundle requests: create 214 ms, category assignment 50 ms, save 185 ms, publish 142 ms. These are single local development observations, not deployed performance acceptance. Temporary verification entries were permanently removed.
- All 16 existing IDs, URLs, copy, galleries, prices, draft pointers and publication states compared with the pre-migration backup. Obsolete type relationships removed; SQLite foreign-key check clean.
- One-time migration files were removed. No remote data changes or deployments.

## Historical verification recorded for Phase 2

- `pnpm test`: 36 tests pass, including real EmDash runtime and SQLite policies, Contributor create/reference-only writes, optional size-guide publication, staged prices/references, dependency protection, media readiness, availability defaults, and interrupted model installation.
- `pnpm test:d1`: isolated local D1 rehearsal passes; first/repeated apply, marker checks and locks exercised without contacting remote D1.
- `pnpm typecheck`: zero errors or warnings. `pnpm build`: succeeds; EmDash admin dependencies retain the bundler's large-chunk notice.
- Native local admin forms inspected: product references, default availability, sortable image rows, and separate Conjunto component links. No sample catalog entries saved. Local invalid write returns 400; anonymous model write returns 401.
- Fresh review found two validation omissions, reproduced in failing tests and fixed: Contributor relationship writes and unpublished optional size guides. No outstanding Critical, Important or Minor findings.

Review boundaries: deployed CPU and complete admin budgets still require staging measurement; checkout, public snapshots and frontend belong to later phases; multilingual reference resolution is outside this single-language catalog phase. The Spanish locale/import decision remains explicit before importing content.
