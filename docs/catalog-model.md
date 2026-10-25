# Local catalog model

Phase 2 supplies the CMS model. Public shop pages, Shopify import, Stripe, and the approved visual system follow in later phases. Work stays on `master`.

## Start and update locally

Run `pnpm dev`, then in another terminal run `pnpm cms:model`. Open [local admin](http://localhost:4321/_emdash/admin). Refresh an already-open admin tab after the model changes.

The command authenticates through EmDash's development-only session endpoint, applies `customseda.catalog.v1` to local D1, and regenerates `emdash-env.d.ts` from EmDash's development type-generation endpoint. It uses a fixed localhost origin and accepts no remote target. Existing content and credentials remain intact. Starter Posts are hidden in navigation, not deleted; they may still appear in dashboard counts.

The version marker is written only after success. An interrupted installation can be retried: collections are created before reference fields, application schema is upserted, and initial lookup entries use conflict-skip so existing IDs and editorial changes survive. Future schema changes need a new migration version; do not edit an already-applied version to migrate an existing database.

A pre-migration local SQLite backup is in ignored `backups/`. Normal deployment never copies that database over a remote database.

## Editing catalog entries

| Type | Rules |
| --- | --- |
| Productos | Exactly one category, collection and color; one or more supported sizes. Top supports S–XL; Braguita supports XS–XL. |
| Conjuntos | Exactly one Top and one Braguita. Own price, description and gallery. Component color and collection must match and are inherited. No direct size field. |
| Categorías | Stable codes `top` and `braguita`. Conjuntos is a separate type, not a third category. |
| Colecciones | Initial record Margarita. Stable code for import and matching. |
| Tallas | Initial records XS, S, M, L, XL with display order. Codes are stable. |
| Colores | Editable names and optional hexadecimal swatch. Create actual colors during import; no invented colors are seeded. |

Prices are integer **EUR cents**: enter `5900` for €59. Availability defaults to Yes. This is an editorial sale switch, with no quantity or inventory tracking. A bundle is purchasable only when it and both components are published and available. At checkout the buyer selects a supported size for each component independently; checkout is phase 5.

The gallery uses EmDash's native reorderable repeater. Each row has a media image, required alternative text, and optional horizontal/vertical focal coordinates from 0 to 1. The first row is the main image. Uploads must be ready before publication; at least one image is required to publish. Drafts can have an empty gallery.

Create and publish lookup entries before products, then create Conjuntos from those products. A bundle's price is independent of the sum of its component prices. Unavailable components make the bundle unavailable; they do not force deletion or block drafting.

REST saves reject incompatible references, including requests containing only references. Native publish and scheduling policies recheck pending fields and references for all runtime writers, including MCP and plugins. EmDash 1.3.1 does not pass the pending reference payload to its before-save hook: a non-REST writer can stage an invalid selection, but cannot publish it through the runtime. Importers must call `validateCatalogWrite` before saving; do not write catalog SQL directly.

Components cannot be deleted or unpublished while referenced. Recategorization or color/collection changes that would break an existing Conjunto are rejected. Protection covers both live and current draft links; obsolete revision history does not block removal. Unlink or trash the dependent bundle first. Changes to lookup labels/copy are allowed; stable category/size codes, and used collection/color codes, are protected.

## Supporting content

- **Pages:** native title/body and SEO, preserving the foundation's existing pages.
- **Size Guides:** reusable rich-text measurement tables and instructions, optionally linked from products.
- **Site Settings:** homepage hero, production copy, contact/social links, and enabled/text/link fields for the announcement bar. Use one settings entry for the site.
- **Popups:** enabled switch, content/image/button, start/end dates, opening delay and dismissal period. Visibility and accessible dismissal behavior are implemented with the frontend later.
- **Shipping Rules:** initially disabled; zone, country/postal selectors, EUR-cent charge, free-shipping threshold, and delivery copy. Merchant-approved amounts and address handling are phase 5.
- **Navigation:** use native EmDash menus. Replace temporary starter links during the URL and content audit.

No sample products, bundles, merchant shipping prices, or source images are imported by the model migration. Initial lookup records retain the current database locale; field labels are Spanish. The import must settle the site's locale configuration before loading the Spanish catalog.

The [local Shopify import](import/shopify-local-import.md) now supplies the actual catalog and supporting content in Spanish (`es`), the configured site default. A separate `customseda.shopify-source.v1` migration adds optional source JSON fields and permits missing size references at the schema layer for native incomplete drafts. Catalog REST validation and publication still require valid sizes. Two source bottoms intentionally remain size-less drafts; no supported sizes were invented. All 16 imported catalog entries are drafts, while imported color lookup labels are published locally. Existing seeded lookup IDs remain intact and resolve through EmDash's reference fallback.

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

## Verification recorded for Phase 2

- `pnpm test`: 36 tests pass, including real EmDash runtime and SQLite policies, Contributor create/reference-only writes, optional size-guide publication, staged prices/references, dependency protection, media readiness, availability defaults, and interrupted model installation.
- `pnpm test:d1`: isolated local D1 rehearsal passes; first/repeated apply, marker checks and locks exercised without contacting remote D1.
- `pnpm typecheck`: zero errors or warnings. `pnpm build`: succeeds; EmDash admin dependencies retain the bundler's large-chunk notice.
- Native local admin forms inspected: product references, default availability, sortable image rows, and separate Conjunto component links. No sample catalog entries saved. Local invalid write returns 400; anonymous model write returns 401.
- Fresh review found two validation omissions, reproduced in failing tests and fixed: Contributor relationship writes and unpublished optional size guides. No outstanding Critical, Important or Minor findings.

Review boundaries: deployed CPU and complete admin budgets still require staging measurement; checkout, public snapshots and frontend belong to later phases; multilingual reference resolution is outside this single-language catalog phase. The Spanish locale/import decision remains explicit before importing content.
