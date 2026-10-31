# Custom Seda Migration — Todo Plan

> Phase 1 execution was authorized in chat on 2026-10-24. Later phases remain planned. Use the executing-plans skill for inline execution unless another method is chosen.

> **Execution order updated by the user on 2026-10-25:** Work locally for now. All remaining staging provisioning, deployment, remote authentication/acceptance, CPU measurement, and recovery work moves to phase 7, after local phases 3–6 and before production launch. Existing remote resources remain in place. Cloudflare Free feasibility is still a launch requirement, but is not a gate for local development. The next local step is phase 3's Shopify inventory and source-data audit.

> **Status — 2026-10-30:** production and staging are deployed at the user's request; see the environment note below. Remaining work is organized into phases 7–13; phase 7 covers GitHub deployment and rebuilds. Open phase 5 work waits on the merchant's Stripe account.

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

**Progress:** Local runtime and infrastructure tooling are implemented. Earlier remote work provisioned a staging Worker and isolated staging/production D1 + R2; both databases have 90 core migrations applied. Remaining remote acceptance and recovery tasks are tracked in phases 8–9. See [verification evidence](../../phase-1-verification.md).

**Local exit condition:** The CMS works locally with the Cloudflare runtime, local D1/R2, and persistence after restart. Remote Workers Free feasibility and persistence across deployment are phase 9 launch gates.

## 2. Define the content model

- [x] Define Products, Conjuntos, Categories, Collections, Sizes, and Colors with stable IDs/slugs and explicit cardinality.
- [x] Add product descriptions, integer-cent EUR prices, publication status, availability default Yes, SEO metadata, and native catalog IDs (obsolete source IDs retired after import).
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

**Progress — 2026-10-25:** Public-source inventory recorded locally: 16 products (5 Conjuntos, 5 Tops, 6 Braguitas), 98 variants, 81 gallery positions / 74 distinct gallery images, six collection records, and supporting pages/navigation/SEO. The one-time inventory and reports were retired after the completed migration; their earlier versions remain in Git history. Public completeness is cross-checked against pagination and sitemaps; private/export completeness, supported-size decisions, canonical colors, bundle links, and import remain pending. No CMS writes or staging operations were performed.

**Merchant clarification — 2026-10-25:** Explicit Shopify sizes are correct and must be preserved. The user subsequently instructed importing the public website as it stands. Missing sizes and set/component differences are preserved in source metadata on drafts; they do not block the local import. Publication/checkout must resolve the source/model differences before selling those items.

- [x] Inventory the merchant-authorized public products, variants, galleries, collection content, pages, navigation, SEO metadata, and URLs.
- [x] Use public storefront data as explicitly requested; do not infer private/draft Shopify records. Reconcile an authenticated export if later supplied.
- [x] Map pieces and sets to separate draft types, preserving source component-size options and independent set prices.
- [x] Audit duplicate/missing component mappings, color names, XS/XL options, unavailable items, and inconsistent source copy.
- [x] Implement and run a restartable importer (retired after the completed import on 2026-10-27).
- [x] Import supporting lookup records and individual products before linking draft Conjuntos.
- [x] Copy original catalog/supporting images into local R2 with gallery order, original alt provenance, fallback alt labels, and a source-to-local asset manifest.
- [x] Compare local counts, descriptions, prices, relationships, sizes, gallery order, and all local media bytes against source data.
- [x] Record source-to-CMS and preferred retained public URL mappings; implement actual public routes/redirects in phases 4 and 7.

**Local import result:** 11 Products, 5 Conjuntos, 7 Pages, 1 Size Guide, 6 color lookups, and 1 homepage/settings record. The 106 source image URLs deduplicate into 95 local media files (210,164,752 bytes), all verified by SHA-256. All catalog and supporting content remains draft except the color lookup labels. A retry retained all 31 content records without duplicates. The importer and source metadata were retired on 2026-10-27; see [content maintenance](../../content-maintenance.md) for current originals and cleanup behavior. Source gaps are preserved for later publication/checkout work; no staging operation occurred.

**Exit condition:** A verified local catalog and content set can be recreated or updated through a repeatable import. Production now holds the catalog and staging reads it; rehearse any final content transfer in phases 8 and 12 using the current EmDash content and originals; do not restore the retired source importer or copy the whole local database.

## 4. Build the reusable visual system and public pages

**Progress — 2026-10-25:** The current-site visual audit is recorded in [the visual audit](../../design/visual-audit.md). It covers the Studio theme tokens, computed styles, and desktop/mobile captures of the home, product, Conjunto, collection, Margarita and size-guide pages. Open merchant asks are a vector logo and icon source, plus the fate of the unused theme schemes and the WhatsApp button. The token foundation lives in `src/styles/`: CUBE layers, AA-checked semantic colors, Utopia scales generated by `pnpm design:fluid`, Open Props easings, and self-hosted Cormorant/Montserrat through the Astro Fonts API. In development, `/design/tokens` renders a specimen of the tokens. The shared compositions (`wrapper`, `stack`, `cluster`, `grid`, `split`) and the presentational components in `src/components/` and `src/layouts/Shop.astro` take plain view props from `src/lib/shop/view.ts`. In development, `/design/components` renders them with imported local drafts. The homepage (`/`) and Margarita story (`/pages/margarita`) render from editable Site Settings fields (`customseda.storefront.v1`), native menus and the Margarita page; see [the catalog workflow](../../catalog-model.md#storefront-model-and-homepage-content). Catalog listings live at `/collections/bikinis` (everything), `/collections/conjuntos`, `/collections/top`, `/collections/braguitas` and one view per CMS collection (`/collections/margarita`). Color, size and availability filters and sorting run in the browser and are kept in the query string. Product pages live at `/products/<slug>` with gallery, supported sizes, size guide, optional production text from Site Settings, availability states and related items; the add button stays disabled until the phase 5 cart. Conjuntos use the same path with their own price and gallery, one size selector per component (each component's supported sizes) and links to both pieces. Tierra and any Conjunto whose Braguita has no imported sizes show "Tallas por confirmar" until the merchant supplies them. Content pages render at `/pages/<slug>`, `/blogs/noticias` ("Sobre Seda") and `/policies/<slug>`; Contacto shows the settings' email and social links; missing content renders a branded 404 with status 404; `/<slug>` redirects to the public page path. Starter posts/category/tag routes and the starter layout are removed. The announcement bar (Site Settings: enabled, text, link) and the first enabled, unexpired Popup render on every public page; the browser applies the popup's start/end window, delay and dismissal period (stored per popup in localStorage) and opens it as a native modal dialog. The bounded accessibility and responsive audit and its fixes are recorded in [the phase 4 audit](../../design/phase4-audit.md).

- [x] Audit representative existing desktop/mobile pages and extract logo, font, palette, spacing, border, image-ratio, and motion decisions.
- [x] Define semantic CSS tokens, Utopia fluid type/space scales, selected Open Props values, and a CUBE CSS structure.
- [x] Build shared layouts and components: container, stack, cluster, grid, header/footer, buttons, forms, product cards, galleries, price, and size selectors.
- [x] Implement homepage and Margarita story using editable CMS content and reusable sections.
- [x] Implement combined catalog, category/collection views, color/size/availability filtering, sorting, and empty states.
- [x] Implement individual product pages with gallery, size guide, supported sizes, production information, and availability states.
- [x] Implement Conjunto pages with separate Top and Braguita selectors and their own price/gallery.
- [x] Implement About, contact, shipping/returns, policy pages, and clear missing-page behavior.
- [x] Implement accessible popup settings with schedule, dismissal frequency, focus handling, and editable text; implement the editable announcement bar.
- [x] Audit desktop/mobile consistency, keyboard navigation, contrast, focus, forms, and long-content behavior; fix findings in a bounded pass.

**Exit condition:** The imported content renders in a coherent, responsive site that preserves the approved brand identity.

## 5. Implement buy-now Stripe Checkout

> **Scope split by the user on 2026-10-25:** keep checkout simple for now. Each product or Conjunto page buys one item directly; the multi-item cart moves to phase 13, after launch. A Conjunto is one Stripe line item carrying both component sizes. A Stripe account does not exist yet: build and test locally against mocked Stripe responses, then complete the test-mode checks once the account exists.

**Progress — 2026-10-25:** Buy-now checkout is implemented locally against mocked Stripe responses; see [checkout and Stripe operations](../../checkout.md). Product pages post to `/api/checkout`, which revalidates against D1 and creates a one-line Stripe Checkout Session with a metadata snapshot. Shipping comes from enabled Shipping Rules (local drafts from the source page; the EU rule stays disabled until rates are confirmed). `/api/stripe/webhook` verifies signatures and records deduplicated events in `customseda_payment_events` (model version `customseda.checkout.v1`), and flags postal codes outside the chosen zone. The header cart link is hidden until phase 13. Still open: the Stripe account, merchant tax/rate/copy confirmation, the Stripe test-mode run, and the receipt approach.

- [ ] **Merchant:** create the Stripe account (business details, payout bank account, branding, Spanish locale, EUR); share test-mode secret and webhook signing keys for local `.env`; live keys only during phases 11–12.
- [x] Replace the disabled add button with a buy-now form posting the item ID, selected size(s), quantity, shipping destination, and the displayed price; it works without JavaScript.
- [x] Create a small checkout endpoint that loads authoritative database values, validates published/available items (a Conjunto and both components) and supported sizes, and calculates prices server-side.
- [x] Return to the product page with an explicit message for unavailable items, unsupported sizes, or a displayed price that no longer matches, before any payment.
- [x] Create one Stripe line item per purchase (Conjunto: "Top M · Braguita S") and snapshot item and component references, sizes, quantity, currency, and charged prices in session and payment metadata within Stripe limits.
- [x] Implement shipping from the CMS Shipping Rules: Canarias, Península/Baleares, EU, and free Gran Canaria pickup, with thresholds on the server-calculated subtotal. The buyer chooses the destination before Stripe; webhooks flag postal codes that contradict it for manual review.
- [ ] Confirm tax/customs treatment (IGIC/IVA), EU rates, and production/shipping copy with the merchant before configuring live checkout.
- [x] Implement verified Stripe webhooks and minimal restricted D1 payment-event records; deduplicate events and track payment status, including delayed payment success and failure.
- [x] Add success/cancel pages that report verified payment state.
- [ ] Test individual pieces, mixed-size Conjuntos, quantities, shipping boundaries, tampered prices and sizes, duplicate events, delayed and failed payments, and cancellation; repeat the flow in Stripe test mode once the account exists.
- [ ] Document manual production, shipping, refund, and customer-notification steps using Stripe Dashboard; confirm the receipt/contact-email approach.

**Exit condition:** Test purchases charge the intended amount and preserve clear production details, without an EmDash order-management UI.

## 6. Connect publishing, images, transitions, and PWA

**Progress — 2026-10-25:** Implemented per the [phase 6 design](../specs/2026-10-25-phase6-static-publishing-design.md) and [plan](2026-10-25-phase6-static-publishing.md).

- **Static pages:** public pages prerender to slash-free HTML from a per-environment snapshot of published content.
- **Gate:** static assets stay behind the foundation gate (`run_worker_first`) until launch.
- **Deploys:** the runner migrates, snapshots, builds WebP derivatives, builds and deploys. GitHub Actions deploys staging from `master`; production is gated by `PRODUCTION_DEPLOY_ENABLED`.
- **Rebuilds:** CMS publishes, scheduled publishes and an admin route dispatch rebuilds.
- **Transitions and PWA:** Astro `ClientRouter` navigation (chosen by the user over native cross-document transitions, which Firefox does not support), with the product photo and title animating from list to detail. The PWA is installable with an offline fallback.

The user chose to stay local on 2026-10-25, so all remote work moves to phase 7: the GitHub, Cloudflare and rebuild-token setup, the first staging deploy (`pnpm deploy:staging --allow-empty`, using the wrangler login), the staging catalog import (blocked on a staging administrator), remote verification of publish → rebuild, and the browser checks (transitions, popup back/forward, offline, update banner, mobile performance), which move to phase 10's browser pass.

- [x] Implement a build-time published-content snapshot/query pipeline against local content without exposing CMS credentials to browsers; verify remote environment selection in phase 7.
- [x] Connect relevant publish/update/delete/settings changes to an authenticated rebuild trigger; coalesce bursts and retain the last successful site if a build fails.
- [ ] Verify a publication and media change reaches public pages after a successful rebuild; verify drafts remain private. Tracked in phase 7 (“Verify publish → rebuild on production”): it needs a real CMS publication, and no publish-triggered rebuild had run by 2026-10-30.
- [x] Generate bounded responsive image derivatives during build/import, with modern formats, dimensions, correct sizes, and lazy loading below the fold.
- [x] Measure media size and build duration against free quotas; document limits and the fallback for new uploads/failed processing.
- [x] Add Astro view transitions for matching product photos/titles with stable unique names, browser fallback, and reduced-motion support.
- [x] Verify popup lifecycle behavior across Astro navigation and browser back/forward. Verified 2026-10-30 in Chrome (mobile viewport) on a production-mode build with a fixture popup, because production has no enabled popup: it opens once after its delay with focus inside; Escape, the close button, the backdrop and its button dismiss it; once dismissed it stays closed after ClientRouter navigation, back, forward, reload and a back/forward-cache restore; navigating before the delay opens a single popup on the new page.
- [x] Add PWA manifest, icons, service worker, offline fallback, and update behavior.
- [x] Keep admin, checkout, webhooks, private responses, and authoritative price/availability outside service-worker caches; keep checkout online-only.
- [x] Verify offline messaging, fresh deployment activation, image loading, navigation, and performance on mobile. Verified 2026-10-30 in Chrome. Offline: visited pages serve from cache, unvisited pages show “Sin conexión”, and checkout requests fail instead of being served from cache. This found that pages reached through ClientRouter links were not kept for offline; fixed by keeping network-first HTML responses (`keepsForOffline`). Update: a changed `sw.js` shows “Nueva versión disponible”; “Actualizar” reloads into the new cache and deletes the old one (local build; confirm on production after the next deploy in phase 10's browser pass). Mobile on production, Lighthouse profile (412×823, DPR 1.75, Slow 4G, 4× CPU): LCP 1.1 s home, 1.1 s collection, 1.9 s product; CLS 0; the LCP photo is eager with high priority, other photos lazy, all WebP with dimensions. A DPR 3 phone on the same throttling loads the 1440 px photos (product LCP 4.1 s).

**Exit condition:** Publishing reliably refreshes prerendered pages, media loads efficiently, transitions remain accessible, and offline behavior cannot authorize stale purchases.

## Remaining-phase organization

The former phase 7 is split into phases 7–12 below; the former phase 8 cart is now phase 13. Earlier documents referring to the broad “phase 7” mean these pre-launch workstreams. This is a regrouping of existing scope, not authorization for remote actions.

> **Environment model changed on 2026-10-30** ([shared-staging plan](2026-10-30-shared-production-staging.md), [deployment](../../deployment.md)): production is deployed and is the only CMS and the only data (D1 `customseda-production`, its R2 bucket and SESSION KV). Staging is a private server-rendered draft view that reads production's bindings, with Stripe test keys and no CMS, migrations, cron or payment records. Its own D1 is deleted. Remote work below targets production unless it says otherwise; anything that writes or restores data needs a target other than staging, which shares production's data.

Complete backups before production write-based acceptance checks. Phase 11 depends on the merchant’s Stripe account and the remaining phase 5 work; its live purchase/refund check follows the domain switch in phase 12. Complete all other acceptance gates before switching the domain.

## 7. GitHub deployment and CMS rebuilds

- [x] Create `GITHUB_REBUILD_TOKEN` (fine-grained PAT, Actions read/write on this repo only), set it on the production Worker and record owner and expiry in `docs/deployment.md`. Completed on 2026-10-30 and validated against the GitHub workflow API; owner `infocustomseda-collab`, expiry 2027-01-28 00:00 UTC. See the administrator workstation setup and token renewal record in `docs/deployment.md`.
- [x] Configure GitHub environments `production` and `staging` with `CLOUDFLARE_API_TOKEN` and `EMDASH_TARGET_FINGERPRINT` (both production's reviewed value), and enable both deployment flags. Verified on 2026-10-31: both flags are `true`; [master deployment 41156877509](https://github.com/infocustomseda-collab/customseda/actions/runs/41156877509) passed verification, then production, then staging. Production completed at 01:48:32 UTC; staging started at 01:48:35 UTC. CMS-triggered production-only dispatch remains part of the acceptance check below.
- [ ] Verify publish → rebuild on production: a publication and a media change reach the public pages, and drafts stay off them while staging shows them.

**Acceptance status — 2026-10-31:** deployment configuration is complete. The latest 20 workflow runs contain push and pull-request events, with no CMS workflow dispatch evidence. The developer laptop has no authenticated production EmDash CLI session. Finish backups before production write-based acceptance; use an actual merchant-approved content/image update, never disposable production test records. Verify that its CMS publication dispatches production only, wait for the rebuild, compare public content/media with staging, and retain the workflow URL and before/after evidence. Phase 7 remains open until this check passes.

**Exit condition:** GitHub deploys production before staging, and CMS publication rebuilds public pages without exposing drafts.

## 8. Backups and recovery

- [ ] Set up production backups: a scheduled D1 export (or a documented D1 Time Travel restore) plus an R2 media copy, kept outside Cloudflare. On 2026-10-30 the old staging data was deleted without backup and production became the only copy.
- [ ] Document backup/restore and failed-migration recovery; verify a restore of database, media, keys, and authentication into an agreed recovery target that is neither production nor staging (staging reads production's data).
- [ ] Rehearse final import, migration, deployment, restore, and rollback on a disposable target (a temporary D1/R2 pair), not on staging, which shares production's data.

**Exit condition:** Database, media, keys and authentication can be restored on a separate target, and deployment rollback has been rehearsed.

## 9. CMS access, staging and Cloudflare Free acceptance

Completed environment setup:

- [x] Production and staging Workers with their bindings: production owns D1, R2 and SESSION KV; staging reads them (2026-10-30). Supersedes the earlier “separate staging data” item.
- [x] Production setup: administrator, `EMDASH_ENCRYPTION_KEY`, reviewed fingerprint, catalog model and core migrations (`needsSetup: false`, 2026-10-30).
- [x] Staging secrets: production's `EMDASH_ENCRYPTION_KEY` and `FOUNDATION_ACCESS_TOKEN`. Staging gate verified (401 Basic, `noindex`, admin → production) on 2026-10-30.
- [x] Catalog in production: the 2026-10-30 production snapshot holds 16 products, 7 pages and 4 shipping rules.

Remaining acceptance work:

- [ ] Verify draft visibility on staging: an editor arriving through “View site” and a Basic reviewer both see a known draft. Unverified on 2026-10-30, because production had no drafts. This also closes the open check in the [private staging plan](2026-10-30-private-staging.md).
- [ ] Delete the leftover bucket `customseda-staging-media`, after confirmation.
- [x] Configure CMS email through the native `cloudflareEmail()` provider and a restricted `send_email` binding. PR #34 merged on 2026-10-30: sender `noreply@customseda.com`, verified administrator and developer recipients, active domain and ready Email Routing. The user confirmed the email setup works on 2026-10-31. This completes email setup; the broader administrator/passkey and CMS acceptance checks below remain separate.
- [ ] Register the merchant's administrator/passkey on production and verify login, content creation, image upload, relationship editing, and publication with the catalog model.
- [ ] Test a real admin photo upload (~3 MB) through the deployed production Worker. On 2026-10-27, media uploads through the deployed staging Worker exceeded the Workers Free CPU limit, and the import had to run through a local Worker on remote bindings.
- [ ] Verify restart/redeployment against existing remote data and confirm published content and media persist.
- [ ] Measure complete authenticated create/save/publish requests, realistic gallery uploads, the hourly cron, Worker CPU/errors, bundle/startup constraints, and account quotas; document whether the essential CMS workflows work on Workers Free.
- [ ] Review Cloudflare request/CPU/database/media/build usage and configure available usage/error notifications.

**Exit condition:** Essential CMS workflows work on Workers Free, staging shows authorized drafts, and content and media survive redeployment.

If essential CMS workflows exceed Workers Free limits, identify the exact blocker and agree on an architecture change before launch.

## 10. Storefront, SEO and browser validation

- [x] Launch switch on production: `FOUNDATION_LOCKED=false` without `assets.run_worker_first` (2026-10-30, at the user's request). Staging stays locked permanently.

- [ ] Decide what production's public workers.dev site is before cutover: currently public (`FOUNDATION_LOCKED=false`) and indexable. Choose between keeping it public with `noindex` until the domain switch and restoring the gate; also decide which Stripe keys it uses before launch.
- [ ] Browser pass (Chrome DevTools MCP, isolated profile): product transitions and reduced motion; the update banner against a real production deploy. Popup back/forward, PWA install/offline and mobile image LCP were verified in phase 6 on 2026-10-30.
- [ ] Add canonical URLs, sitemap, robots rules, social metadata, and accurate Product/offer structured data. Staging already sends `X-Robots-Tag: noindex, nofollow`.
- [ ] Verify redirects and internal links for products, collections, the old About/blog route, and policy pages.
- [ ] Verify build/type checks, focused model/checkout tests, mobile browsing, keyboard flows, and Stripe payment/webhook tests.

**Exit condition:** Search metadata, redirects, browser behavior and release checks are verified before domain cutover.

## 11. Stripe and merchant readiness

The buy-now checkout implementation and its remaining account, tax, test-mode and merchant-operation tasks remain in phase 5. This phase covers deployed payment readiness.

- [ ] Stripe webhooks per environment, once the Stripe account exists: staging endpoint with test keys (`sk_test_…`) and its signing secret; production endpoint with live keys at launch. Staging's webhook currently returns 503 because no keys are set.
- [ ] Confirm live Stripe configuration, shipping rules, production lead times, contact handling, and policy text.
- [ ] Arrange a merchant-authorized live purchase/refund check and verify production details in Stripe Dashboard.

**Exit condition:** Phase 5 test-mode work is complete, live payment settings and merchant operations are confirmed, and an authorized live purchase/refund is verified before Shopify retirement.

## 12. Domain cutover and operational handover

- [ ] Schedule a content freeze or final delta import so Shopify changes/orders are not missed during cutover.
- [ ] Back up the source and target; retain Shopify records needed for historical orders/refunds.
- [ ] After explicit launch authorization, switch the domain and verify HTTPS, canonical host, admin authentication, images, checkout, and live webhook delivery.
- [ ] Retire Shopify only after the live site and historical-record access are confirmed.
- [ ] Deliver an operations guide covering CMS publication/rebuilds, image uploads, Stripe orders, backups, migrations, and recovery.

**Exit condition:** The real domain serves the verified replacement, historical Shopify records remain accessible, and the merchant has an operations guide.

## 13. Add the multi-item cart (after launch)

Moved from phase 5 by the user on 2026-10-25; buy-now checkout covers launch.

- [ ] Define a versioned local cart containing product or Conjunto IDs, selected component sizes, and quantity; persist it across page navigation.
- [ ] Implement cart add/edit/remove behavior and show both component sizes for Conjuntos.
- [ ] Extend the checkout endpoint to validate every cart line and calculate shipping on the combined subtotal.
- [ ] Handle stale prices, unavailable products, and removed sizes with explicit cart correction before payment.
- [ ] Choose cart-clearing behavior based on verified payment state; verify cart lifecycle across Astro navigation, back/forward, and the PWA.
- [ ] Test mixed carts, shipping thresholds across lines, and cart corrections in Stripe test mode.

**Exit condition:** Several items buy in one Stripe Checkout with one shipping charge, and stale carts are corrected before payment.

## Suggested repository boundaries during implementation

- `astro.config.mjs`, `wrangler.jsonc`, `src/worker.ts`: framework/runtime/binding configuration.
- `src/lib/cms/`: content model, querying, validation, and build snapshots.
- `src/lib/commerce/`: cart types, authoritative checkout validation, snapshots, shipping, and Stripe integration.
- `src/pages/api/`: checkout, webhook, and rebuild-trigger endpoints.
- `src/pages/`, `src/layouts/`, `src/components/`: routes, layouts, and reusable presentation.
- `src/styles/`: tokens, foundations, compositions, blocks, and exceptions.
- `scripts/media/` and `assets/originals/`: local media originals and their verified manifest.
- `scripts/deploy/`: target inspection, migrations, deployment checks, and recovery helpers.
- `tests/`: focused business-rule tests and essential browser/payment flows.
- `docs/`: source mapping, deployment evidence, decisions, and operating instructions.

Use the selected EmDash version's supported schema/hooks APIs when turning this roadmap into implementation tasks. These boundaries are proposed organization, not assertions about scaffold-generated files.
