# Custom Seda Migration — Todo Plan

> Phase 1 execution was authorized in chat on 2026-10-24. Later phases remain planned. Use the executing-plans skill for inline execution unless another method is chosen.

> **Execution order updated by the user on 2026-10-25:** Work locally for now. All remaining staging provisioning, deployment, remote authentication/acceptance, CPU measurement, and recovery work moves to phase 7, after local phases 3–6 and before production launch. Existing remote resources remain in place. Cloudflare Free feasibility is still a launch requirement, but is not a gate for local development. The next local step is phase 3's Shopify inventory and source-data audit.

**Goal:** Replace the Shopify site with an Astro + EmDash shop on Cloudflare Free, retaining the approved identity and using Stripe Checkout.

**Architecture:** Prerender public pages and rebuild after CMS publication. Run EmDash and checkout/webhook endpoints on Workers, store content in D1 and media in R2. Use Stripe Dashboard for order/payment/refund management and manual production/shipping.

**Tech stack:** Astro, TypeScript, EmDash, Cloudflare adapter, Workers, D1, R2, Wrangler, pnpm, plain CSS with CUBE CSS/Utopia/selected Open Props, Stripe Checkout.

**Spec:** Decisions agreed in this chat, recorded below. This is a phased todo roadmap, not a command-by-command implementation specification.

## Agreed requirements

- Made to order: no quantities, inventory reservations, or stock synchronization.
- Separate editable Products and Conjuntos types, combined in the public catalog.
- Products have title, descriptions, reorderable images (first is main), own price, availability defaulting to Yes, exactly one category, one collection, one color, and multiple supported sizes.
- Product categories are Top and Braguita; Conjuntos is a storefront grouping and separate CMS type.
- Sizes are XS, S, M, L, XL; each product declares its supported subset. Current site shows Top S–XL and Braguita XS–XL; verify all source products during import.
- Conjuntos have exactly one linked Top and one linked Braguita, their own price, descriptions, images, and availability; no direct sizes.
- A Conjunto buyer independently chooses each linked component's size.
- Margarita is the initial collection.
- Public pages are prerendered; CMS publishing triggers a rebuild.
- Preserve the approved visual identity with coherent reusable styles; no Tailwind.
- Include product-to-detail transitions, image optimization, PWA behavior, editable popup, and announcement bar.
- Stripe Dashboard handles orders, payments, and refunds. No custom order-management interface in EmDash.
- Cloudflare Free is a binding target whose feasibility must be demonstrated, not assumed. Stripe payment fees are separate from hosting costs.

## Proposed defaults to confirm before their phase

- Derive a Conjunto's color and collection from its components and require them to match.
- A Conjunto can be purchased only when it and both linked components are available.
- Spanish/EUR initially; verify whether additional languages or currencies are needed.
- Preserve current shipping regions, free-shipping thresholds, and local pickup, after reviewing exact checkout behavior and production lead times.
- Add Pages, Size Guides, Site Settings, Popup Settings, and structured Shipping Configuration. Defer a journal and customer accounts unless requested.
- Use the current site for initial visual authority, with original logo/font/image assets preferred over scraping rendered substitutes.

## Review focus

- CMS operations can exceed Free CPU limits even if public pages are static: prove remote administration before storefront work.
- CMS changes can invalidate bundle relationships: validate on all write paths and recheck at checkout.
- Browser carts and prerendered prices can become stale: server-side authoritative validation must explain changes before payment.
- Stripe events can repeat, arrive late, or represent unpaid sessions: verify signatures and process fulfillment/payment state idempotently.
- Shipping regions overlap within Spain: do not infer Canarias versus mainland/Baleares from country alone.

## 1. Establish the local Cloudflare foundation

- [x] Select and pin mutually compatible stable Astro, EmDash, adapter, and Wrangler versions from the official Cloudflare template.
- [x] Scaffold the minimal project with TypeScript and pnpm; retain only required integrations.
- [x] Configure local Workers runtime with local D1/R2 rather than a different database adapter.
- [x] Omit sandboxed plugins, sandbox runner, and Worker Loader bindings that require Workers Paid.
- [x] Establish explicit remote core migrations: build, inspect database target, migrate through the CLI, deploy the same artifact, and check status.
- [x] Use production runtime migration checking and development automatic migrations; serialize remote migration jobs.

**Progress:** Local runtime and infrastructure tooling are implemented. Earlier remote work provisioned a staging Worker and isolated staging/production D1 + R2; both databases have 90 core migrations applied. All remaining remote acceptance and recovery tasks are deferred to phase 7. See [verification evidence](../../phase-1-verification.md).

**Local exit condition:** The CMS works locally with the Cloudflare runtime, local D1/R2, and persistence after restart. Remote Workers Free feasibility and persistence across deployment are phase 7 launch gates.

## 2. Define the content model

- [x] Define Products, Conjuntos, Categories, Collections, Sizes, and Colors with stable IDs/slugs and explicit cardinality.
- [x] Add product descriptions, integer-cent EUR prices, publication status, availability default Yes, SEO metadata, and source Shopify IDs.
- [x] Define ordered gallery items with media reference, alt text, optional focal point, and first-image main-image behavior.
- [x] Define separate Top/Braguita links for Conjuntos and independent component size selections.
- [x] Implement server-side validation for wrong-category links, missing components, unsupported sizes, self/cyclic references, and invalid prices.
- [x] Protect existing Conjuntos when components are deleted, unpublished, recategorized, or otherwise changed.
- [x] Confirm and enforce the proposed color/collection inheritance and availability rules.
- [x] Define Pages, reusable Size Guides, homepage/site settings, navigation, popup, announcement, and shipping configuration.
- [x] Version content-model updates separately from EmDash core migrations; keep initial seed data small and free of catalog/media bulk imports.
- [x] Verify model constraints through admin editing and API/import writes using focused tests.

**Exit condition:** Local model implemented and verified. Editors can create valid Products and Conjuntos; REST writes and runtime publication policies enforce the model. Non-REST pending-reference limitations and remote acceptance checks are documented in [the catalog workflow](../../catalog-model.md).

## 3. Audit and import Shopify content

**Progress — 2026-10-25:** Public-source inventory recorded locally: 16 products (5 Conjuntos, 5 Tops, 6 Braguitas), 98 variants, 81 gallery positions / 74 distinct gallery images, six collection records, and supporting pages/navigation/SEO. See [audit and unresolved mappings](../../import/shopify-audit.md) and [structured source inventory](../../import/shopify-public-inventory.json). Public completeness is cross-checked against pagination and sitemaps; private/export completeness, supported-size decisions, canonical colors, bundle links, and import remain pending. No CMS writes or staging operations were performed.

**Merchant clarification — 2026-10-25:** Explicit Shopify sizes are correct and must be preserved. The user subsequently instructed importing the public website as it stands. Missing sizes and set/component differences are preserved in source metadata on drafts; they do not block the local import. Publication/checkout must resolve the source/model differences before selling those items.

- [x] Inventory the merchant-authorized public products, variants, galleries, collection content, pages, navigation, SEO metadata, and URLs.
- [x] Use public storefront data as explicitly requested; do not infer private/draft Shopify records. Reconcile an authenticated export if later supplied.
- [x] Map pieces and sets to separate draft types, preserving source component-size options and independent set prices.
- [x] Audit duplicate/missing component mappings, color names, XS/XL options, unavailable items, and inconsistent source copy.
- [x] Implement a restartable importer with dry-run reporting and stable Shopify-ID mapping to avoid duplicate records/media.
- [x] Import supporting lookup records and individual products before linking draft Conjuntos.
- [x] Copy original catalog/supporting images into local R2 with gallery order, original alt provenance, fallback alt labels, and a source-to-local asset manifest.
- [x] Compare local counts, descriptions, prices, relationships, sizes, gallery order, and all local media bytes against source data.
- [x] Record source-to-CMS and preferred retained public URL mappings; implement actual public routes/redirects in phases 4 and 7.

**Local import result:** 11 Products, 5 Conjuntos, 7 Pages, 1 Size Guide, 6 color lookups, and 1 homepage/settings record. The 106 source image URLs deduplicate into 95 local media files (210,164,752 bytes), all verified by SHA-256. All catalog and supporting content remains draft except the color lookup labels. A retry retained all 31 content records without duplicates. See [workflow](../../import/shopify-local-import.md), [verified result](../../import/shopify-local-result.json), and [URL map](../../import/shopify-url-map.json). Source gaps are preserved for later publication/checkout work; no staging operation occurred.

**Exit condition:** A verified local catalog and content set can be recreated or updated through a repeatable import. Rehearse the import on staging in phase 7.

## 4. Build the reusable visual system and public pages

**Progress — 2026-10-25:** The current-site visual audit is recorded in [the visual audit](../../design/visual-audit.md). It covers the Studio theme tokens, computed styles, and desktop/mobile captures of the home, product, Conjunto, collection, Margarita and size-guide pages. Open merchant asks are a vector logo and icon source, plus the fate of the unused theme schemes and the WhatsApp button. The token foundation lives in `src/styles/`: CUBE layers, AA-checked semantic colors, Utopia scales generated by `pnpm design:fluid`, Open Props easings, and self-hosted Cormorant/Montserrat through the Astro Fonts API. In development, `/design/tokens` renders a specimen of the tokens. The shared compositions (`wrapper`, `stack`, `cluster`, `grid`, `split`) and the presentational components in `src/components/` and `src/layouts/Shop.astro` take plain view props from `src/lib/shop/view.ts`. In development, `/design/components` renders them with imported local drafts. The homepage (`/`) and Margarita story (`/pages/margarita`) render from editable Site Settings fields (`customseda.storefront.v1`), native menus and the Margarita page; see [the catalog workflow](../../catalog-model.md#storefront-model-and-homepage-content). Catalog listings live at `/collections/bikinis` (everything), `/collections/conjuntos`, `/collections/top`, `/collections/braguitas` and one view per CMS collection (`/collections/margarita`). Color, size and availability filters and sorting run in the browser and are kept in the query string. Product pages live at `/products/<slug>` with gallery, supported sizes, size guide, optional production text from Site Settings, availability states and related items; the add button stays disabled until the phase 5 cart. Conjuntos use the same path with their own price and gallery, one size selector per component (each component's supported sizes) and links to both pieces. Tierra and any Conjunto whose Braguita has no imported sizes show "Tallas por confirmar" until the merchant supplies them.

- [x] Audit representative existing desktop/mobile pages and extract logo, font, palette, spacing, border, image-ratio, and motion decisions.
- [x] Define semantic CSS tokens, Utopia fluid type/space scales, selected Open Props values, and a CUBE CSS structure.
- [x] Build shared layouts and components: container, stack, cluster, grid, header/footer, buttons, forms, product cards, galleries, price, and size selectors.
- [x] Implement homepage and Margarita story using editable CMS content and reusable sections.
- [x] Implement combined catalog, category/collection views, color/size/availability filtering, sorting, and empty states.
- [x] Implement individual product pages with gallery, size guide, supported sizes, production information, and availability states.
- [x] Implement Conjunto pages with separate Top and Braguita selectors and their own price/gallery.
- [ ] Implement About, contact, shipping/returns, policy pages, and clear missing-page behavior.
- [ ] Implement accessible popup settings with schedule, dismissal frequency, focus handling, and editable text; implement the editable announcement bar.
- [ ] Audit desktop/mobile consistency, keyboard navigation, contrast, focus, forms, and long-content behavior; fix findings in a bounded pass.

**Exit condition:** The imported content renders in a coherent, responsive site that preserves the approved brand identity.

## 5. Implement cart and Stripe Checkout

- [ ] Define a versioned local cart containing product or Conjunto IDs, selected component sizes, and quantity; persist it across page navigation.
- [ ] Implement cart add/edit/remove behavior and show both component sizes for Conjuntos.
- [ ] Create a small checkout endpoint that loads authoritative database values, validates published/available items and supported sizes, and calculates prices server-side.
- [ ] Handle stale prices, unavailable products, and removed sizes with explicit cart correction before payment.
- [ ] Snapshot item titles, component references, selected sizes, quantities, currency, and charged prices when checkout is created.
- [ ] Make Stripe line items and associated order details readable for manual production in Stripe Dashboard; verify how all required details are surfaced within Stripe limits.
- [ ] Implement agreed shipping regions, thresholds, and pickup; verify address collection distinguishes Canarias, mainland/Baleares, and other destinations before committing to hosted-checkout behavior.
- [ ] Confirm tax/customs treatment and production/shipping copy with the merchant before configuring checkout.
- [ ] Implement verified Stripe webhooks and minimal restricted D1 payment-event records; deduplicate events and check payment status, including delayed payment success.
- [ ] Add success/cancel/error pages and choose cart-clearing behavior based on verified payment state.
- [ ] Test individual pieces, mixed-size Conjuntos, quantities, shipping boundaries, tampered prices, duplicate events, delayed payments, failed payments, and cancellation in Stripe test mode.
- [ ] Document manual production, shipping, refund, and customer-notification steps using Stripe Dashboard; confirm the receipt/contact-email approach.

**Exit condition:** Test purchases charge the intended amount and preserve clear production details, without an EmDash order-management UI.

## 6. Connect publishing, images, transitions, and PWA

- [ ] Implement a build-time published-content snapshot/query pipeline against local content without exposing CMS credentials to browsers; verify remote environment selection in phase 7.
- [ ] Connect relevant publish/update/delete/settings changes to an authenticated rebuild trigger; coalesce bursts and retain the last successful site if a build fails.
- [ ] Verify a publication and media change reaches public pages after a successful rebuild; verify drafts remain private.
- [ ] Generate bounded responsive image derivatives during build/import, with modern formats, dimensions, correct sizes, and lazy loading below the fold.
- [ ] Measure media size and build duration against free quotas; document limits and the fallback for new uploads/failed processing.
- [ ] Add Astro view transitions for matching product photos/titles with stable unique names, browser fallback, and reduced-motion support.
- [ ] Verify cart and popup lifecycle behavior across Astro navigation and browser back/forward.
- [ ] Add PWA manifest, icons, service worker, offline fallback, and update behavior.
- [ ] Keep admin, checkout, webhooks, private responses, and authoritative price/availability outside service-worker caches; keep checkout online-only.
- [ ] Verify offline messaging, fresh deployment activation, image loading, navigation, and performance on mobile.

**Exit condition:** Publishing reliably refreshes prerendered pages, media loads efficiently, transitions remain accessible, and offline behavior cannot authorize stale purchases.

## 7. Validate staging, rehearse launch, and cut over

All staging work is deferred to this phase. Complete the remote acceptance gate before production launch; local results do not establish Workers Free feasibility.

### Deferred staging and remote acceptance

- [ ] Complete separate staging and production Workers, D1 databases, R2 buckets, and session bindings; reuse existing resources and keep local, staging, and production data isolated.
- [ ] Configure runtime secrets, environment-specific URLs, admin authentication, and media delivery; avoid production URL/passkey settings leaking into staging.
- [ ] Register the merchant's staging administrator/passkey and verify fresh setup/login, content creation, image upload, relationship editing, and publication with the catalog model.
- [ ] Verify restart/redeployment against existing remote data and confirm published content and media persist.
- [ ] Measure complete authenticated create/save/publish requests, realistic gallery uploads, scheduled tasks, Worker CPU/errors, bundle/startup constraints, and account quotas; document whether the essential CMS workflows work on Workers Free.
- [ ] Document backup/restore and failed-migration recovery; verify a staging restore including database, media, keys, and authentication using an agreed safe recovery target.
- [ ] Verify remote environment selection for the public snapshot, authenticated rebuild triggers, and publication/media propagation on staging.

**Remote acceptance gate:** Essential CMS operations must work on Workers Free and existing content must survive redeployment. If this fails, identify the exact blocker and agree on an architecture change before launch.

### Launch rehearsal and cutover

- [ ] Add canonical URLs, sitemap, robots rules, social metadata, and accurate Product/offer structured data; block staging indexing.
- [ ] Verify redirects and internal links for products, collections, the old About/blog route, and policy pages.
- [ ] Rehearse final import, production migration, deployment, restore, and rollback on staging.
- [ ] Verify build/type checks, focused model/checkout tests, mobile browsing, keyboard flows, and Stripe payment/webhook tests.
- [ ] Review Cloudflare request/CPU/database/media/build usage and configure available usage/error notifications.
- [ ] Confirm live Stripe configuration, shipping rules, production lead times, contact handling, and policy text.
- [ ] Schedule a content freeze or final delta import so Shopify changes/orders are not missed during cutover.
- [ ] Back up the source and target; retain Shopify records needed for historical orders/refunds.
- [ ] After explicit launch authorization, switch the domain and verify HTTPS, canonical host, admin authentication, images, checkout, and live webhook delivery.
- [ ] Arrange a merchant-authorized live purchase/refund check and verify production details in Stripe Dashboard.
- [ ] Retire Shopify only after the live site and historical-record access are confirmed.
- [ ] Deliver an operations guide covering CMS publication/rebuilds, image uploads, Stripe orders, backups, migrations, and recovery.

**Exit condition:** The live domain serves the verified replacement, checkout works, operations are documented, and rollback remains available during the transition.

## Suggested repository boundaries during implementation

- `astro.config.mjs`, `wrangler.jsonc`, `src/worker.ts`: framework/runtime/binding configuration.
- `src/lib/cms/`: content model, querying, validation, and build snapshots.
- `src/lib/commerce/`: cart types, authoritative checkout validation, snapshots, shipping, and Stripe integration.
- `src/pages/api/`: checkout, webhook, and rebuild-trigger endpoints.
- `src/pages/`, `src/layouts/`, `src/components/`: routes, layouts, and reusable presentation.
- `src/styles/`: tokens, foundations, compositions, blocks, and exceptions.
- `scripts/import/`: source normalization, import, media copying, and reconciliation reports.
- `scripts/deploy/`: target inspection, migrations, deployment checks, and recovery helpers.
- `tests/`: focused business-rule tests and essential browser/payment flows.
- `docs/`: source mapping, deployment evidence, decisions, and operating instructions.

Use the selected EmDash version's supported schema/hooks APIs when turning this roadmap into implementation tasks. These boundaries are proposed organization, not assertions about scaffold-generated files.
