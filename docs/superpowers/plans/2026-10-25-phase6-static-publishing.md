# Phase 6: Static Shop, CI Deploys and Publishing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve the public shop as prerendered pages built from a published-content snapshot. GitHub Actions deploys from `master` and after CMS publishes, images ship as build-time derivatives, and the shop gains cross-document transitions and a PWA.

**Architecture:** A Node step reads one environment's published content from D1 (and image originals from R2) through explicit Wrangler bindings. It writes a gitignored snapshot JSON and image derivatives, and Astro prerenders every public route from them. Live Worker routes remain for the admin, checkout, webhook and checkout result pages. The existing deploy runner gains a snapshot step and a noninteractive mode. A GitHub workflow calls it per environment, and an EmDash plugin hook dispatches that workflow after publishes.

**Tech Stack:** Astro 7.4.2, `@astrojs/cloudflare` 14.4.2, EmDash 1.3.1, Wrangler 4.152.0, sharp 0.35.5 (already installed through Astro), Node `node:test`, GitHub Actions.

**Spec:** [docs/superpowers/specs/2026-10-25-phase6-static-publishing-design.md](../specs/2026-10-25-phase6-static-publishing-design.md). Read it before any task. The roadmap is [2026-10-24-custom-seda.md](2026-10-24-custom-seda.md), phase 6.

## Global Constraints

- pnpm, Workers Free. No Tailwind. Preserve the approved identity (`src/styles/`, CUBE CSS).
- No sandboxed plugins or Worker Loader bindings. `migrations.runtime` stays `check`.
- Secrets live only in Worker secret bindings or GitHub environment secrets. Never use `import.meta.env` for them. Never commit snapshot output, derivatives, tokens or `.dev.vars*`.
- Staging data (content, media URLs) must never reach a production build, and production data must never reach a staging build. Every snapshot records its environment, and the deploy runner refuses a mismatch.
- No public page reads D1 per request. Live routes: `/_emdash/*`, `/api/checkout`, `/api/stripe/webhook`, `/checkout/gracias`, `/checkout/cancelado`.
- `/api/checkout` keeps revalidating against D1. Static prices are never trusted.
- One deploy per environment at a time. Never auto-accept an unreviewed migration fingerprint. Never copy a local database to a remote one.
- `FOUNDATION_LOCKED=true` keeps every request, static assets included, behind the gate on staging and production until launch.
- Production deploys run only when the GitHub variable `PRODUCTION_DEPLOY_ENABLED` is `true`. Otherwise the production job is skipped, not failed.
- `pnpm dev` keeps showing local drafts live. `/design/*` stays dev-only.
- Static assets limits on Free: 20,000 files and 25 MiB per file. Record the Worker gzip size after the phase (currently about 5.06 MiB).
- Match surrounding code style. `src/lib/shop/*` uses tabs and normal TypeScript formatting; `src/lib/cms/*` and `scripts/*` use the compact style.

## Review Focus

1. **A snapshot read from the wrong environment or an empty database:** the runner refuses to deploy (environment mismatch or no published products or Conjuntos without `--allow-empty`). Tests in Task 1 and Task 4.
2. **Content published while a deploy is running:** the newer dispatch queues behind the running job and is not cancelled. Workflow concurrency in Task 5, with a test asserting `cancel-in-progress: false`.
3. **An image whose original is missing in R2, or that sharp cannot decode:** the build still succeeds and the page falls back to the original media URL; the report lists the image. Test in Task 7.
4. **A visitor on a stale cached page buying after a price change:** the service worker never caches `/api/*` or `/checkout/*`, and checkout revalidates. Strategy test in Task 10.
5. **Two product cards with the same transition name on one page,** which breaks the transition: names are unique per page. Test in Task 9.

---

### Task 1: Published-content snapshot

**Files:**
- Create: `src/lib/shop/snapshot.ts`, `scripts/build/snapshot.mjs`, `scripts/build/bindings.mjs`
- Modify: `.gitignore` (add `src/generated/`), `package.json` (script `snapshot`)
- Test: `tests/shop-snapshot.test.mjs`

**Interfaces:**
- Consumes: `loadShop(db, { drafts: false })` from `src/lib/shop/content.ts`, and `remoteModelConfig(target)` / `getPlatformProxy` as used in `scripts/cms/remote-model.mjs`.
- Produces:
  - `type MenuSnapshot = { name: string; items: { label: string; url: string }[] }`
  - `type ShopSnapshot = { version: 1; environment: "local" | "staging" | "production"; generatedAt: string; shop: ShopContent; menus: { primary: MenuSnapshot; footer: MenuSnapshot } }`
  - `createSnapshot(db: Kysely<Database>, environment: ShopSnapshot["environment"]): Promise<ShopSnapshot>`
  - `assertPublishable(snapshot: ShopSnapshot, { environment, allowEmpty }: { environment: string; allowEmpty: boolean }): void`, which throws `Error` with a message naming the reason.
  - `SNAPSHOT_PATH = "src/generated/shop-snapshot.json"`
  - `openBindings(environment): Promise<{ db: Kysely<Database>; media: R2Bucket; dispose(): Promise<void> }>` in `scripts/build/bindings.mjs`: local persisted state for `local`, remote bindings from `wrangler.jsonc` `env.<environment>` for `staging`/`production`, validated with `validateTarget`.
  - CLI: `pnpm snapshot --env local|staging|production [--allow-empty]` writes `SNAPSHOT_PATH` atomically (temp file plus rename).

- [ ] **Step 1: Write failing tests** in `tests/shop-snapshot.test.mjs`, using the in-memory database pattern from `tests/storefront-model.test.mjs` plus `applyModelMigrations`:
  - `createSnapshot reads published entries only and both menus`: one published and one draft product → `snapshot.shop.products.length === 1`; menus `primary`/`footer` items keep their order; `environment` is echoed.
  - `assertPublishable refuses another environment`: snapshot `staging`, expected `production` → throws `/staging/`.
  - `assertPublishable refuses an empty catalog unless allowed`: no products and no Conjuntos → throws `/sin productos publicados|no published/i`; with `allowEmpty: true` it passes.
- [ ] **Step 2:** Run `node --test tests/shop-snapshot.test.mjs`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement.** Menus come from EmDash's menu tables in the same database. Find the table and column names in the installed `emdash` migrations, and map items to `{ label, url }` the way `siteChrome` expects (read `src/lib/shop/site.ts`). The CLI uses `openBindings`, then `createSnapshot`, then `assertPublishable` (with `allowEmpty` from the flag), then writes the file.
- [ ] **Step 4:** Run `node --test tests/shop-snapshot.test.mjs`. Expected: PASS. Run `pnpm snapshot --env local --allow-empty` with the dev server stopped or running. Expected: the file is written and the printed product/Conjunto/page counts match published local content (0 is expected locally because the catalog is draft).
- [ ] **Step 5: Commit** `feat: build-time published-content snapshot`.

### Task 2: Prerender public pages from the snapshot

**Files:**
- Modify: `src/lib/shop/page.ts`, `src/lib/shop/content.ts` (if needed), every public page: `src/pages/index.astro`, `[slug].astro`, `404.astro`, `blogs/noticias.astro`, `collections/[handle].astro`, `pages/[slug].astro`, `pages/contact.astro`, `pages/margarita.astro`, `policies/[slug].astro`, `products/[slug].astro`; `src/pages/checkout/gracias.astro`, `cancelado.astro`; `package.json` (`build` = `pnpm snapshot --env local --allow-empty && astro build`)
- Create: `src/lib/shop/paths.ts`
- Test: `tests/shop-paths.test.mjs`

**Interfaces:**
- Consumes: `ShopSnapshot`, `SNAPSHOT_PATH` (Task 1).
- Produces:
  - `loadShopPage(Astro)`: same `ShopPage` return. In `import.meta.env.DEV` it keeps the live read with drafts. Otherwise it reads the snapshot JSON (import or `fs` at build) and builds chrome from `snapshot.menus`.
  - `loadSiteChrome(path: string): SiteChrome`, from the snapshot, for live routes.
  - `paths.ts`: `productPaths(shop)`, `collectionPaths(shop)`, `pagePaths(shop)`, `policyPaths(shop)`, `rootRedirectPaths(shop)`. Each returns `{ params: Record<string,string> }[]` for `getStaticPaths`, using the same resolution rules the pages use today (`productDetail`, `catalogViews`, the content-page and policy helpers).

- [ ] **Step 1: Write failing tests** in `tests/shop-paths.test.mjs` with the fixture style of `tests/shop-detail.test.mjs`:
  - `product paths cover pieces and Conjuntos with both components, and skip a Conjunto missing one`;
  - `collection paths include bikinis, conjuntos, top, braguitas and one per CMS collection code`;
  - `page and policy paths come from published page slugs only`.
- [ ] **Step 2:** Run `node --test tests/shop-paths.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement** `paths.ts`, then set `export const prerender = true` and `getStaticPaths` on every public page. Live routes (`gracias`, `cancelado`, `/api/*`) stay `prerender = false` and use `loadSiteChrome`, so they make no D1 reads. In dev, `getStaticPaths` reads live data (Astro calls it per request in dev). Static pages cannot read query strings: keep the BuyBox `checkoutError` prop only when `Astro.url.searchParams` is available; the existing browser script shows the reason on prerendered pages. `404.astro` is prerendered.
- [ ] **Step 4: Verify:**
  - `node --test tests/shop-paths.test.mjs` and `pnpm test`. Expected: PASS.
  - With a local snapshot that contains published content (publish a few local entries in the admin, or temporarily build with a fixture snapshot), `pnpm exec astro build`. Expected: `dist/client/products/<slug>/index.html` exists for each product, and `dist/client/404.html` exists.
  - `pnpm dev`: `/products/fuego` still shows drafts live.
- [ ] **Step 5: Commit** `feat: prerender public pages from the snapshot`.

### Task 3: Keep static assets behind the foundation gate

**Files:**
- Modify: `wrangler.jsonc` (`env.staging` and `env.production`: `"assets": { "run_worker_first": true }`, with a comment that removing it is the launch switch), `src/worker.ts` (if needed), `docs/deployment.md`
- Test: `tests/foundation-access.test.mjs` (extend), `tests/deployment.test.mjs` (config assertion)

**Interfaces:**
- Consumes: `foundationAccess(request, env)` from `src/lib/foundation-access.ts`. The adapter's handler (`node_modules/@astrojs/cloudflare/dist/utils/handler.js`) serves static assets through `env.ASSETS` when the Worker runs first.
- Produces: `validateTarget` additionally rejects a target whose environment has `FOUNDATION_LOCKED === "true"` without `assets.run_worker_first === true`, with the error `Gated environments must run the Worker before static assets.`

- [ ] **Step 1: Write the failing test** `gated environments must route static assets through the Worker` in `tests/deployment.test.mjs`: a config with `FOUNDATION_LOCKED: "true"` and no `run_worker_first` → throws that message; the same config with `assets.run_worker_first: true` → passes.
- [ ] **Step 2:** Run `node --test tests/deployment.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement** the validation and the `wrangler.jsonc` change.
- [ ] **Step 4: Verify:**
  - `pnpm test`. Expected: PASS.
  - Build, then run `pnpm exec wrangler dev -c dist/server/wrangler.json --port 4322 --var FOUNDATION_LOCKED:true --var FOUNDATION_ACCESS_TOKEN:t` with `run_worker_first` set in the generated config.
  - Unauthenticated `GET /` and `GET /products/<slug>`. Expected: 401.
  - With `Authorization: Basic base64(seda:t)`. Expected: 200, served from the prerendered HTML.
  - Stop the server.
- [ ] **Step 5: Commit** `feat: keep prerendered assets behind the foundation gate until launch`.

### Task 4: Deploy runner: snapshot step, noninteractive migration

**Files:**
- Modify: `scripts/deploy/target.mjs`, `scripts/deploy/run.mjs`, `docs/deployment.md`
- Test: `tests/deployment.test.mjs`

**Interfaces:**
- Consumes: the `pnpm snapshot` CLI (Task 1) and `remoteCatalogModel` (existing).
- Produces:
  - `deploymentCommands(target, { fingerprint, allowEmpty }: { fingerprint?: string; allowEmpty?: boolean } = {})` returns, in this order:
    1. migration `--status`
    2. migration (with `--expected-target-fingerprint <fp>` when `fingerprint` is set)
    3. `['catalog-model']`
    4. `['snapshot', target.environment, allowEmpty]`
    5. `['astro','build']`
    6. `['wrangler','deploy','--env',env]`
    7. migration `--check`
  - `run.mjs` reads `EMDASH_EXPECTED_TARGET_FINGERPRINT` and `--allow-empty` from its arguments. It runs the snapshot step in-process through Task 1's functions with `CLOUDFLARE_ENV` set. Interactive use without a fingerprint behaves as today.

- [ ] **Step 1: Update and extend tests:**
  - Rewrite `migrates the explicit database before uploading and checks afterwards` to the new order (snapshot after catalog model, build after snapshot, deploy after build).
  - Add `passes a reviewed fingerprint only when provided`.
  - Add `the snapshot step targets the deploy environment`.
- [ ] **Step 2:** Run `node --test tests/deployment.test.mjs`. Expected: FAIL on the new order.
- [ ] **Step 3: Implement.** Keep `withDeploymentLock` around the whole sequence (on CI the checkout is fresh, so the lock is per run; the GitHub concurrency group of Task 5 serializes across runs).
- [ ] **Step 4:** Run `pnpm test`. Expected: PASS. Do not deploy here.
- [ ] **Step 5: Commit** `feat: snapshot step and noninteractive migration in the deploy runner`.

### Task 5: GitHub Actions deploy workflow

**Files:**
- Create: `.github/workflows/deploy.yml`, `tests/deploy-workflow.test.mjs`
- Modify: `docs/deployment.md` (CI section: required GitHub environments, secrets and variables, how to enable production, manual run)

**Interfaces:**
- Consumes: `pnpm deploy:staging` / `pnpm deploy:production` (Task 4).
- Produces: workflow `deploy.yml` with these properties.
  - **Triggers:** `push` to `master`, and `workflow_dispatch` with inputs `environment` (choice: `staging`, `production`) and `reason` (string, optional).
  - **Jobs:**
    - `verify`: install, `pnpm test`, `pnpm typecheck`.
    - `staging`: `needs: verify`; runs on push, or on dispatch with `environment == 'staging'`; `environment: staging`.
    - `production`: runs on push only after `staging` succeeds, or on dispatch with `environment == 'production'`. Both cases also require `vars.PRODUCTION_DEPLOY_ENABLED == 'true'`. `environment: production`.
  - **Concurrency:** each deploy job has `group: deploy-<environment>` and `cancel-in-progress: false`.
  - **Environment per deploy job:** `CLOUDFLARE_API_TOKEN` (secret), `CLOUDFLARE_ACCOUNT_ID` (from `wrangler.jsonc`, no secret), `EMDASH_EXPECTED_TARGET_FINGERPRINT` (environment variable `EMDASH_TARGET_FINGERPRINT`).
  - **Toolchain:** Node and pnpm versions from `.tool-versions` / `packageManager`, with `pnpm install --frozen-lockfile`.

- [ ] **Step 1: Write a failing test** `tests/deploy-workflow.test.mjs` that reads the YAML as text (no new dependency) and asserts:
  - both triggers are present;
  - each deploy job has `cancel-in-progress: false` and a `deploy-staging` / `deploy-production` group;
  - the production job's `if:` contains `vars.PRODUCTION_DEPLOY_ENABLED == 'true'`;
  - no step echoes secrets;
  - the deploy steps call `pnpm deploy:staging` / `pnpm deploy:production`.
- [ ] **Step 2:** Run it. Expected: FAIL (file missing).
- [ ] **Step 3:** Write the workflow.
- [ ] **Step 4:** Run `pnpm test`. Expected: PASS.
- [ ] **Step 5: Human step (stop and hand over).** The user creates:
  - GitHub environments `staging` and `production`;
  - a Cloudflare API token with Workers deploy, D1 edit and R2 read rights on the account, stored as `CLOUDFLARE_API_TOKEN` in each environment;
  - the reviewed fingerprints, stored as `EMDASH_TARGET_FINGERPRINT`. Read the staging fingerprint from `pnpm exec emdash migrate --status ...` and show it to the user to confirm.

  Leave `PRODUCTION_DEPLOY_ENABLED` unset. Push only after the user confirms.
- [ ] **Step 6: Verify.** After merge, the push to `master` shows `verify` and `staging` green and `production` skipped. `pnpm cf:whoami` and `pnpm exec emdash migrate --check ... --wrangler-env staging` confirm the deploy.
- [ ] **Step 7: Commit** `ci: deploy staging (and gated production) from master`.

### Task 6: Publish-triggered rebuild

**Files:**
- Create: `src/lib/publish/rebuild.ts`, `src/lib/cms/rebuild-route.ts`
- Modify: `src/lib/cms/policy.ts` (after-hooks), `astro.config.mjs` (inject `/_emdash/api/customseda/rebuild`), `wrangler.jsonc` (vars `DEPLOY_ENVIRONMENT`: `staging` / `production`; `GITHUB_REPOSITORY`: `infocustomseda-collab/customseda`), `.dev.vars.example` (commented `GITHUB_REBUILD_TOKEN`), `docs/deployment.md`
- Test: `tests/publish-rebuild.test.mjs`

**Interfaces:**
- Produces:
  - `rebuildConfig(env: Record<string, unknown>): { token: string; repository: string; environment: "staging" | "production" } | null`. Returns `null` when anything is missing or the environment is not `staging`/`production` (local dev is always a no-op).
  - `requestRebuild(config, reason: string, fetchImpl = fetch): Promise<void>`. Sends `POST https://api.github.com/repos/<repository>/actions/workflows/deploy.yml/dispatches` with body `{ ref: "master", inputs: { environment, reason } }` and headers `Authorization: Bearer <token>`, `Accept: application/vnd.github+json`, `X-GitHub-Api-Version: 2022-11-28`, `User-Agent: customseda-rebuild`. It throws on a non-2xx response with the GitHub message.
  - `REBUILD_COLLECTIONS`: `products`, `conjuntos`, `categories`, `collections`, `colors`, `sizes`, `size_guides`, `site_settings`, `pages`, `popups`, `shipping_rules`.
- Wiring:
  - The catalog plugin registers `content:afterPublish`, `content:afterUnpublish`, `content:afterDelete` and `content:afterRestore` for `REBUILD_COLLECTIONS`. Each handler calls `after(() => requestRebuild(cfg, "<hook> <collection>").catch(log))` (import `after` from `emdash`) and never throws into the editor's request.
  - Config comes from `cloudflare:workers` `env`.
  - Menu edits have no EmDash hook. The admin-only route `POST /_emdash/api/customseda/rebuild` (role ≥ 50, same origin, `X-EmDash-Request: 1`, the same checks as `model-route.ts`) triggers a rebuild on demand. Document it for menu changes.
  - Coalescing is the workflow's concurrency queue (Task 5).
- Find out whether EmDash's scheduler fires `content:afterPublish` when scheduled content goes live. If it doesn't, also register `content:afterSchedule`, and record what you found.

- [ ] **Step 1: Write failing tests:**
  - `no config means no rebuild` (missing token or environment, or `DEPLOY_ENVIRONMENT=local`) → `null`;
  - `dispatch sends the environment and reason to the deploy workflow`: assert the URL, method, headers and JSON body exactly;
  - `GitHub errors surface their message` (422) → rejects `/422/`;
  - `the route refuses non-admins and cross-origin calls`, with the handler logic extracted into a testable function like `importRequestAllowed`.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement and wire the hooks.
- [ ] **Step 4:**
  - `pnpm test` and `pnpm typecheck`. Expected: PASS.
  - Local `pnpm dev`: publish an entry. Expected: no outbound call (no config) and the editor is unaffected.
- [ ] **Step 5: Human step.** The user creates a fine-grained token (repository `infocustomseda-collab/customseda`, Actions read and write) and sets it with `wrangler secret put GITHUB_REBUILD_TOKEN --env staging`. Record the owner and expiry in `docs/deployment.md`.
- [ ] **Step 6: Verify on staging** (after Task 8 provides content): publish a change in the staging admin. Expected: a `workflow_dispatch` run for `staging` starts; three quick publishes produce at most one running and one queued run; the change is live after the run.
- [ ] **Step 7: Commit** `feat: rebuild the environment after CMS publishes`.

### Task 7: Build-time image derivatives

**Files:**
- Create: `src/lib/shop/images.ts`, `scripts/build/images.mjs`
- Modify: `src/lib/shop/view.ts` (`GalleryImage` gains `sources?: { type: "image/avif" | "image/webp"; srcset: string }[]`), components rendering photos (`Gallery.astro`, `ProductCard.astro`, `home/*.astro`, `StoryContent.astro`, `RichText.astro` image blocks, `SitePopup.astro`), `scripts/deploy/target.mjs` (images step after snapshot), `package.json` (`build` runs it), `.gitignore` (`public/media/`, `.cache/`)
- Test: `tests/shop-images.test.mjs`

**Interfaces:**
- Consumes: `ShopSnapshot`, `openBindings(environment).media` (Task 1).
- Produces:
  - `IMAGE_WIDTHS = [480, 960, 1440]` (no upscaling: keep widths ≤ the original's width, and always keep at least the original size when it is smaller).
  - `snapshotImages(snapshot): { key: string; width: number; height: number }[]`: every media image referenced by galleries, hero, slideshow, highlights, popups and portable-text image blocks, deduplicated by storage key.
  - `derivativeName(key, width, format)` → `/media/<key-stem>-<width>.<avif|webp>`.
  - `withSources(image: GalleryImage, available: Set<string>): GalleryImage`, which adds `sources` only for derivatives that exist.
  - `scripts/build/images.mjs --env <environment>`:
    - reads originals from R2 by storage key;
    - writes `public/media/*` through sharp (AVIF quality 55, WebP quality 75), caching by content hash in `.cache/media`;
    - writes `src/generated/media-manifest.json` (the derivative list) and prints count, total bytes and seconds;
    - exits non-zero if any file is over 25 MiB or the total is over 15,000 files.
  - A missing or undecodable original is reported and skipped; the page keeps the `/_emdash/api/media/file/...` URL.
- Components render `<picture>` with `sources`, the original `<img>` fallback, explicit `width`/`height`, `sizes` per use, `loading="lazy"` except the first above-the-fold image (gallery main, hero first slide) and `decoding="async"`.

- [ ] **Step 1: Write failing tests:**
  - `snapshot images are collected from every image field once`;
  - `widths never upscale`;
  - `missing derivatives fall back to the original URL` (`withSources` with an empty set → no `sources`);
  - `derivative names are stable for a storage key`.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3: Implement.** Generate derivatives in the deploy runner after the snapshot and before the build.
- [ ] **Step 4:**
  - `pnpm test`, then local `pnpm build` with published local content. Expected: `dist/client/media/*` present and pages contain `<picture>`.
  - Record count, bytes and seconds in `docs/deployment.md` (media and build budget).
  - Check one product page in Chrome DevTools MCP (isolated profile) for the image requests and LCP.
- [ ] **Step 5: Commit** `feat: build-time responsive image derivatives`.

### Task 8: Import the Shopify catalog into staging

**Files:**
- Create: `scripts/import/shopify-remote.mjs`, `scripts/import/remote-runtime.mjs`
- Modify: `package.json` (`import:shopify:staging`), `docs/import/shopify-local-import.md` (staging section)
- Test: `tests/shopify-remote.test.mjs`

**Interfaces:**
- Consumes: `buildCatalogPlan`, `assertShopifyAsset` and `verifyUploadedMedia` (`scripts/import/shopify-plan.mjs`); `applyShopifySourceSchema` and `importShopifyDraft` (`src/lib/cms/shopify-import.ts`); `createCatalogPolicy` (`src/lib/cms/policy.ts`); EmDash `handleContentCreate`, `handleMediaCreate` and `handleContentPublish`; the cached originals in `backups/shopify-import-local` when present.
- Produces:
  - `openRemoteRuntime(environment: "staging"): Promise<{ runtime, db, media, dispose }>`. It runs `EmDashRuntime` in Node on the remote D1 (`CatalogD1Dialect`) and R2 (`openBindings`) with the catalog policy plugin, following `tests/helpers/catalog.mjs`. It refuses `production`.
  - `pnpm import:shopify:staging --dry-run|--apply [--publish]`:
    - the dry run prints the planned creates, skips and uploads;
    - `--apply` creates missing media and drafts idempotently by slug and storage hash, applies the storefront fields, homepage settings, popup, menus and shipping rules from `scripts/cms/storefront-content.mjs`;
    - `--publish` publishes in dependency order: lookups, products, Conjuntos, pages, size guides, site settings, popups, shipping rules (Canarias, Península, pickup; EU stays disabled), each through `handleContentPublish` so the catalog policies run.
- If `EmDashRuntime` cannot run against the remote binding, stop and report the blocker. Do not fall back to SQL dumps or copying the local database.

- [ ] **Step 1: Write the failing test** `remote import refuses production and plans idempotently`: `openRemoteRuntime('production')` rejects, and the plan builder run twice against a fixture database reports zero creates the second time (in-memory SQLite via the same runtime factory with an injected dialect).
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `pnpm test`. Expected: PASS.
- [ ] **Step 5: Remote run** (authorized for staging by the spec):
  - `pnpm import:shopify:staging --dry-run` and review the counts against [docs/import/shopify-local-import.md](../../import/shopify-local-import.md): 16 products and Conjuntos (5 Conjuntos, 5 Tops, 6 Braguitas).
  - `--apply`, then `--apply --publish`.
  - `pnpm snapshot --env staging` prints the matching counts.
- [ ] **Step 6: Commit** `feat: import the Shopify catalog into staging`.

### Task 9: Cross-document view transitions

**Files:**
- Modify: `src/styles/` (global layer: `@view-transition { navigation: auto; }` inside `@media (prefers-reduced-motion: no-preference)`), `ProductCard.astro`, `Gallery.astro`, the product page title, `src/lib/shop/site.ts` (`productCard`) and `src/lib/shop/view.ts` (title transition name)
- Test: `tests/shop-view.test.mjs` (extend)

**Interfaces:**
- Produces:
  - `transitionNames(slug: string): { image: string; title: string }`, which returns `product-<slug>-image` and `product-<slug>-title` with the slug reduced to `[a-z0-9-]`;
  - `uniqueTransitions(cards: ProductCardView[]): ProductCardView[]`, which drops `transitionName` from every card after the first with the same name on a page.
- No `ClientRouter`. Native cross-document transitions keep page scripts (BuyBox, popup, catalog filters) on normal page loads. Unsupported browsers navigate normally.

- [ ] **Step 1: Write failing tests:**
  - `transition names are stable and CSS-safe`;
  - `duplicate cards on one page keep a single transition name`.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3: Implement.** Apply `uniqueTransitions` wherever a page renders several cards (catalog, related items, home featured).
- [ ] **Step 4: Verify.**
  - `pnpm test`.
  - In Chrome DevTools MCP, navigating catalog → product animates the photo and title.
  - With reduced motion emulated, there is no animation.
  - Popup lifecycle: open the popup, dismiss it, navigate, then go back and forward. Expected: it stays dismissed. A popup inside its window opens once per load. A bfcache restore does not reopen a dismissed popup; fix with a `pageshow` check if it does.
- [ ] **Step 5: Commit** `feat: product-to-detail view transitions`.

### Task 10: PWA

**Files:**
- Create: `public/manifest.webmanifest`, `public/sw.js`, `public/sw-strategy.js`, `src/pages/offline.astro` (prerendered), icons in `public/icons/` (192, 512, maskable 512, Apple touch 180) generated by `scripts/design/icons.mjs` from `public/brand/seda-wordmark.png` on the brand background token
- Modify: `src/layouts/Shop.astro` (manifest link, theme color, registration script in production builds only, update banner)
- Test: `tests/pwa-strategy.test.mjs`

**Interfaces:**
- Produces: `routeStrategy(url: URL, method: string): "network-only" | "network-first" | "cache-first" | "stale-while-revalidate"` in `public/sw-strategy.js`. It is a classic script that assigns `self.routeStrategy` and is loaded with `importScripts`. Node tests load it with `vm`. Rules:
  - non-GET → `network-only`;
  - path under `/_emdash/`, `/api/`, `/checkout/`, or `/sw.js` → `network-only`;
  - navigation and HTML → `network-first`, falling back to the cached page, then `/offline`;
  - `/_astro/*` and `/fonts/*` → `cache-first`;
  - `/media/*` and `/icons/*` → `stale-while-revalidate`.
- The cache name includes a build id that the build writes into `sw.js`. On `activate`, the worker deletes old caches. A new worker waits, and the page shows "Nueva versión disponible · Actualizar"; the button posts `SKIP_WAITING` and reloads on `controllerchange`.

- [ ] **Step 1: Write the failing test** `tests/pwa-strategy.test.mjs`, with one assertion per rule above plus:
  - `POST /api/checkout` → `network-only`;
  - `GET /checkout/gracias?session_id=x` → `network-only`;
  - `GET /products/fuego` → `network-first`.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement the strategy, the worker, the manifest, icons, the offline page and the update banner (Spanish copy, AA contrast, keyboard reachable).
- [ ] **Step 4: Verify.**
  - `pnpm test`, then `pnpm build`.
  - In Chrome DevTools MCP against the built Worker:
    - the manifest is valid and installable;
    - offline navigation to a visited product shows it, and an unvisited one shows `/offline`;
    - the buy button posts to the network and fails cleanly offline, with no cached checkout;
    - redeploying with a new build id shows the update banner.
  - Record the mobile performance trace in `docs/design/phase6-pwa.md`.
- [ ] **Step 5: Commit** `feat: installable PWA with offline fallback and safe caching`.

### Task 11: Project rules, roadmap and operations docs

**Files:**
- Modify: `AGENTS.md`, `docs/superpowers/plans/2026-10-24-custom-seda.md` (phase 6 checkboxes and progress note; phase 7 keeps acceptance, CPU, recovery and cutover, plus "enable `PRODUCTION_DEPLOY_ENABLED` after the supervised first production setup" and "remove `run_worker_first` with the gate at launch"), `docs/deployment.md`, `README.md`

- [ ] **Step 1: Update AGENTS.md.** Deploys run from GitHub Actions on `master`, with manual deploys kept. Public pages prerender from the snapshot (`pnpm snapshot`). Never prerender live queries outside the snapshot step.
- [ ] **Step 2: Update docs/deployment.md.** Cover the CI setup, publishing and rebuild flow, the rebuild token's owner, expiry and renewal, the media and build budget, the empty-snapshot override, and the launch switches.
- [ ] **Step 3:** Run `pnpm test`, `pnpm test:d1`, `pnpm typecheck`, `pnpm build`. Expected: all pass. Record the Worker gzip size from `wrangler deploy --dry-run`.
- [ ] **Step 4: Commit** `docs: phase 6 operations and project rules`.

## Suggested PR grouping

One PR per task or per pair, following phase 4:

| Order | Tasks | Subject |
| --- | --- | --- |
| 1 | 1 + 2 | snapshot and prerendering |
| 2 | 3 | gated assets |
| 3 | 4 + 5 | runner and CI |
| 4 | 8 | staging import |
| 5 | 6 | rebuild trigger |
| 6 | 7 | images |
| 7 | 9 | transitions |
| 8 | 10 | PWA |
| 9 | 11 | docs |

Task 6's staging verification and Task 7's remote measurement need Task 8's content.
