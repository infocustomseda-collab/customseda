# Preview Workers Implementation Plan

> **Superseded on 2026-10-30** by the [shared-production staging plan](2026-10-30-shared-production-staging.md): staging is now a private server-rendered view of production, and no `-preview` Workers exist. Unchecked items here are not open work; remaining checks are tracked in the [main plan](2026-10-24-custom-seda.md), phase 7.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each remote environment a server-rendered preview Worker (`-preview` suffix, admin plus a live site with drafts) next to the unchanged static public Worker (clean name), so CMS previews work on staging and production.

**Architecture:** One codebase, two builds per environment, following `/Users/lg/works/fdag` (CMS Worker + static public Worker) with the naming inverted: the public Worker keeps the clean name and URL, the preview Worker gets the suffix. `SITE_MODE=preview` builds every page route server-rendered and reads live D1 content, showing drafts only to signed-in editors or valid EmDash `?_preview=` links; logged-out visitors are redirected to the public origin. The public build is today's build; it no longer serves the admin. Both Workers of an environment bind the same D1 database and R2 bucket.

**Tech Stack:** Astro 7 (`astro:route:setup` hook), `@astrojs/cloudflare`, EmDash 1.3.1 (`getRequestContext().preview`, `locals.user`, `POST /_emdash/api/auth/handover`), Wrangler environments, node:test.

**Spec:** Decisions agreed in chat on 2026-10-27 (no separate spec): two Workers per environment as in fdag; preview Worker named `<public>-preview`; public keeps the clean name; same architecture in staging and production.

## Global Constraints

- Worker names and origins:
  - staging public `customseda-staging` → `https://customseda-staging.customseda.workers.dev` (unchanged)
  - staging preview `customseda-staging-preview` → `https://customseda-staging-preview.customseda.workers.dev`
  - production public `customseda-production` → `https://customseda-production.customseda.workers.dev` (unchanged)
  - production preview `customseda-production-preview` → `https://customseda-production-preview.customseda.workers.dev`
- Wrangler environments: `staging`, `staging-preview`, `production`, `production-preview`. A preview environment binds exactly its pair's D1 `database_id` and R2 `bucket_name`; staging and production stay fully separate.
- Build mode variable: `SITE_MODE=preview` for the preview build; unset means public. Runtime role variable in Wrangler `vars`: `SITE_ROLE` = `"public"` | `"preview"`.
- Cross-links in `vars`: public envs set `PREVIEW_SITE_URL`; preview envs set `PUBLIC_SITE_URL`. Each env's `EMDASH_SITE_URL` is its own origin (passkeys bind to the preview origin).
- Drafts are visible only when: dev (`import.meta.env.DEV`), or preview mode with an editor session (`locals.user.role >= 20`, EmDash Contributor) or a valid `_preview` token (`getRequestContext().preview` set). Never in the public build.
- The hourly cron and rebuild vars (`DEPLOY_ENVIRONMENT`, `GITHUB_REPOSITORY`) move to the preview envs, where editing happens. Public envs keep checkout and the Stripe webhook.
- Both Workers keep the foundation gate while `FOUNDATION_LOCKED` is `"true"` (`run_worker_first: true` on the public envs).
- No Tailwind, no sandboxed plugins, `migrations.runtime` stays `check`. Remote core and catalog migrations run once per environment, before either Worker uploads.
- Secrets: the preview Worker needs the same `EMDASH_ENCRYPTION_KEY` as its public pair (shared database), plus `FOUNDATION_ACCESS_TOKEN` and later `GITHUB_REBUILD_TOKEN`; Stripe secrets stay on the public Worker.

## Review Focus

- A logged-out visitor opening a preview URL without `_preview` must land on the same path on the public origin, never see drafts (Task 2 test).
- An expired or forged `_preview` token must render published content only or redirect, never drafts (Task 2 test).
- The public Worker must not expose the admin or the content API: `/_emdash/admin` and `/_emdash/api/*` (except `/_emdash/api/media/file/*`) redirect to the preview origin (Task 3 test).
- `/<slug>` root redirects, which today read `Astro.props` from `getStaticPaths`, must still redirect when rendered on request (Task 4 test).
- Live preview pages read the whole shop per request and may exceed the 10 ms Workers Free CPU limit; measure it on staging before relying on it (Task 7).

---

### Task 1: Site mode and draft visibility

**Files:**
- Create: `src/lib/site-mode.ts`
- Test: `tests/site-mode.test.mjs`

**Interfaces:**
- Produces: `type SiteMode = "dev" | "preview" | "public"`; `siteMode(isDev: boolean, configured: string | undefined): SiteMode` ("preview" only for exactly `"preview"`); `canPreviewDrafts(role: number | undefined): boolean` (`role >= 20`); `draftsVisible(mode: SiteMode, access: { editor: boolean; previewToken: boolean }): boolean`.

- [ ] **Step 1: Write the failing tests** — `siteMode(true, "preview") === "dev"`, `siteMode(false, "preview") === "preview"`, `siteMode(false, undefined) === "public"`, `siteMode(false, "PREVIEW") === "public"`; `canPreviewDrafts(undefined) === false`, `(10) === false`, `(20) === true`; `draftsVisible("public", {editor:true, previewToken:true}) === false`, `("preview", {editor:false, previewToken:false}) === false`, `("preview", {editor:true, previewToken:false}) === true`, `("preview", {editor:false, previewToken:true}) === true`, `("dev", {editor:false, previewToken:false}) === true`.
- [ ] **Step 2: Run** `node --test tests/site-mode.test.mjs` — Expected: FAIL (module not found).
- [ ] **Step 3: Implement** the three functions in `src/lib/site-mode.ts`.
- [ ] **Step 4: Run** `node --test tests/site-mode.test.mjs` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: add site mode and draft visibility rules`.

### Task 2: Preview middleware and live page data

**Files:**
- Create: `src/lib/preview-routing.ts`, `src/components/PreviewBanner.astro`
- Modify: `src/middleware.ts`, `src/lib/shop/page.ts`, `src/layouts/Shop.astro` (render the banner)
- Test: `tests/preview-routing.test.mjs`, `tests/shop-page-mode.test.mjs`

**Interfaces:**
- Consumes: Task 1 functions.
- Produces: `previewRedirect(url: URL, access: { editor: boolean; previewToken: boolean }, publicSiteUrl: string | undefined): string | null` — `null` for `/_emdash`, `/_astro`, `/_image`, `/_server-islands` prefixes, for editors, for valid tokens, or when `publicSiteUrl` is unset; otherwise `new URL(path + search, publicSiteUrl)`. `loadShopContent(): Promise<ShopContent>` and `loadShopPage(Astro)` read live content (`loadShop(await getDb(), { drafts })`) whenever `siteMode(...) !== "public"`, with `drafts` from the request's draft scope; the public build keeps reading the snapshot. Draft scope is request-local via `AsyncLocalStorage` (as fdag `src/utils/draft-scope.ts`): `runWithDrafts(visible: boolean, next)` and `includeDrafts(): boolean` in `src/lib/draft-scope.ts`.

- [ ] **Step 1: Write the failing tests** — `previewRedirect(new URL("https://p.example/products/marea?x=1"), {editor:false, previewToken:false}, "https://pub.example")` returns `"https://pub.example/products/marea?x=1"`; returns `null` for `/_emdash/admin`, for `editor:true`, for `previewToken:true`, and when `publicSiteUrl` is `undefined`. `runWithDrafts(true, () => includeDrafts())` is `true`, `runWithDrafts(false, …)` is `false`, and `includeDrafts()` outside a scope is `false`.
- [ ] **Step 2: Run** `node --test tests/preview-routing.test.mjs tests/shop-page-mode.test.mjs` — Expected: FAIL.
- [ ] **Step 3: Implement** `previewRedirect`, `draft-scope.ts`, and the `page.ts` mode switch; in `src/middleware.ts` chain the existing `catalogWriteMiddleware` with a preview middleware that computes `editor = canPreviewDrafts(locals.user?.role)`, `previewToken = !!getRequestContext()?.preview`, redirects with `previewRedirect(context.url, …, env.PUBLIC_SITE_URL)` in preview mode, and wraps `next()` in `runWithDrafts(draftsVisible(mode, …))`. `PreviewBanner.astro` (Spanish copy: "Vista previa — esta página incluye borradores sin publicar. Volver al panel") shows only when drafts are visible in preview mode, styled with existing tokens.
- [ ] **Step 4: Run** the two test files — Expected: PASS. Run `pnpm test` and `pnpm typecheck` — Expected: all pass, 0 errors.
- [ ] **Step 5: Commit** `feat: render live drafts for editors on the preview Worker`.

### Task 3: Public Worker hands admin traffic to the preview origin

**Files:**
- Create: `src/lib/public-routing.ts`
- Modify: `src/worker.ts`
- Test: `tests/public-routing.test.mjs`

**Interfaces:**
- Produces: `publicAdminRedirect(url: URL, role: string | undefined, previewSiteUrl: string | undefined): string | null` — only when `role === "public"` and `previewSiteUrl` is set: paths starting with `/_emdash/` (and `/_emdash` itself) redirect to the same path and query on `previewSiteUrl`, except `/_emdash/api/media/file/`; everything else returns `null`.

- [ ] **Step 1: Write the failing tests** — public role: `/_emdash/admin` → `https://preview.example/_emdash/admin`, `/_emdash/api/content/products?x=1` → preview URL with query, `/_emdash/api/media/file/A.jpg` → `null`, `/products/marea` → `null`, `/api/stripe/webhook` → `null`; role `"preview"` or `undefined` → always `null`.
- [ ] **Step 2: Run** `node --test tests/public-routing.test.mjs` — Expected: FAIL.
- [ ] **Step 3: Implement** it and call it in `src/worker.ts` after `foundationAccess`, returning `Response.redirect(target, 302)`. In `scheduled`, return early unless `env.SITE_ROLE === "preview"` (the public envs have no cron, this guards a misconfiguration).
- [ ] **Step 4: Run** the test file, `pnpm test`, `pnpm typecheck` — Expected: PASS, 0 errors.
- [ ] **Step 5: Commit** `feat: send admin traffic from the public Worker to the preview Worker`.

### Task 4: Preview build mode

**Files:**
- Create: `src/lib/build/route-mode.ts`
- Modify: `astro.config.mjs`, `src/pages/[slug].astro`
- Test: `tests/route-mode.test.mjs`, `tests/shop-paths.test.mjs` (root redirect lookup)

**Interfaces:**
- Produces: `routePrerender(mode: "preview" | "public", current: boolean | undefined): boolean | undefined` — `false` in preview mode for every page route, `current` otherwise. `rootRedirectTarget(shop: ShopContent, slug: string): string | null` in `src/lib/shop/paths.ts`, used by `[slug].astro` when `Astro.props.target` is absent.
- In `astro.config.mjs`: `const isPreview = process.env.SITE_MODE === "preview"`; `outDir: isPreview ? "./dist-preview" : "./dist"`; Vite `define` of `import.meta.env.SITE_MODE`; an `astro:route:setup` hook applying `routePrerender`; the `astro:build:start` snapshot assertion runs only for the public build.

- [ ] **Step 1: Write the failing tests** — `routePrerender("preview", true) === false`, `routePrerender("public", true) === true`, `routePrerender("public", undefined) === undefined`; `rootRedirectTarget(shop, "<a published page slug>")` equals the target `rootRedirectPaths(shop)` yields for it, and `rootRedirectTarget(shop, "missing") === null`.
- [ ] **Step 2: Run** both test files — Expected: FAIL.
- [ ] **Step 3: Implement** both functions and wire the config; `[slug].astro` rewrites to `/404` when no target.
- [ ] **Step 4: Run** both test files, `pnpm test`, `pnpm typecheck` — Expected: PASS, 0 errors. (The preview build itself is verified in Task 5, which adds its Wrangler environment.)
- [ ] **Step 5: Commit** `feat: build every page on request in preview mode`.

### Task 5: Wrangler environments and target validation

**Files:**
- Modify: `wrangler.jsonc`, `scripts/deploy/target.mjs`, `.gitignore` (`dist-preview/`)
- Test: `tests/deployment.test.mjs`

**Interfaces:**
- Produces: `validateTarget(config, environment)` additionally returns `preview: { environment: "<env>-preview", origin: string }` and throws unless `env["<env>-preview"]` exists with name `"<public name>-preview"`, the same `database_id` and `bucket_name` as its pair, `vars.SITE_ROLE === "preview"`, `vars.PUBLIC_SITE_URL` equal to the pair's origin, and an HTTPS `EMDASH_SITE_URL` different from every other env's; the public env must have `vars.SITE_ROLE === "public"` and `PREVIEW_SITE_URL` equal to the preview origin.

- [ ] **Step 1: Write the failing tests** — a config fixture with all four envs validates and returns the preview origin; each of these throws with a specific message: preview name without `-preview`, preview `database_id` from the other environment, preview bucket different from its pair, preview origin equal to the public origin, missing `SITE_ROLE`, `PUBLIC_SITE_URL` pointing elsewhere.
- [ ] **Step 2: Run** `node --test tests/deployment.test.mjs` — Expected: FAIL.
- [ ] **Step 3: Implement** the validation; add `staging-preview` and `production-preview` to `wrangler.jsonc` with the values in Global Constraints; move `triggers.crons` and `DEPLOY_ENVIRONMENT`/`GITHUB_REPOSITORY` from the public envs to the preview envs (public envs: `"triggers": { "crons": [] }`).
- [ ] **Step 4: Run** `node --test tests/deployment.test.mjs` and `pnpm test` — Expected: PASS. Then `SITE_MODE=preview CLOUDFLARE_ENV=staging-preview pnpm exec astro build` — Expected: build succeeds into `dist-preview/`, `dist-preview/server/wrangler.json` has `"name": "customseda-staging-preview"` and the staging `database_id`, and `dist-preview/client` contains no page HTML, only static assets.
- [ ] **Step 5: Commit** `feat: add preview Worker environments`.

### Task 6: Deploy both Workers

**Files:**
- Modify: `scripts/deploy/target.mjs` (`deploymentCommands`), `scripts/deploy/run.mjs`, `README.md`, `docs/deployment.md`, `AGENTS.md`
- Test: `tests/deployment.test.mjs`, `tests/deploy-workflow.test.mjs`

**Interfaces:**
- Consumes: `validateTarget(...).preview` from Task 5.
- Produces: `deploymentCommands(target, opts)` order: status, migrate, catalog-model, snapshot, images, prerender-db, `astro build`, check-static, `wrangler deploy -c dist/server/wrangler.json`, then `['astro-preview', '<env>-preview']` (run as `SITE_MODE=preview CLOUDFLARE_ENV=<env>-preview astro build`), `wrangler deploy -c dist-preview/server/wrangler.json`, migrate `--check`.

- [ ] **Step 1: Write the failing test** — `deploymentCommands(target)` for staging equals the list above exactly (deep equal), with both deploys using explicit `-c` paths.
- [ ] **Step 2: Run** `node --test tests/deployment.test.mjs` — Expected: FAIL.
- [ ] **Step 3: Implement** the command list and the `astro-preview` step in `run.mjs` (spawn with the two env vars). Update docs: both Workers and URLs per environment, which Worker serves what, secrets per Worker, and the `AGENTS.md` runtime rule ("Public pages prerender from the snapshot; the `-preview` Worker renders on request for editors and preview links").
- [ ] **Step 4: Run** `pnpm test`, `pnpm typecheck` — Expected: all pass.
- [ ] **Step 5: Commit** `feat: deploy the public and preview Workers together`.

### Task 7: Staging cutover (operational, with the user)

No code. Each remote step needs the user's go-ahead.

- [ ] **Step 1:** User signs in to the current staging admin (`https://customseda-staging.customseda.workers.dev/_emdash/admin`) and keeps that tab open.
- [ ] **Step 2:** Upload the preview Worker's secrets: `pnpm exec wrangler secret bulk .env.cloudflare-staging --env staging-preview` (same encryption key and gate token as staging).
- [ ] **Step 3:** Deploy only the preview Worker (Task 4 build + `wrangler deploy -c dist-preview/server/wrangler.json`). Expected: the preview URL answers 401 without gate credentials, and with them a logged-out request to `/` returns 302 to the public origin.
- [ ] **Step 4:** Move the passkey to the new host with EmDash's handover: temporarily redeploy the current staging Worker with `EMDASH_SITE_URL` set to the preview origin, then the user requests the sign-in link from the open admin session (`POST /_emdash/api/auth/handover`), opens it on the preview host and adds a passkey in Security settings. Expected: user signed in at `…-preview…/_emdash/admin`.
- [ ] **Step 5:** `pnpm deploy:staging` (both Workers). Expected: public `/_emdash/admin` → 302 to the preview origin; public pages unchanged; preview `/products/marea` shows a draft edit to signed-in editors with the banner; an admin "Preview" link opens on the preview host and shows the draft; the same URL without session or token redirects to the public site.
- [ ] **Step 6:** Measure with `pnpm exec wrangler tail --env staging-preview --format json`: CPU time of a preview page render and of a publish. Record results in `docs/deployment.md` (Free-tier feasibility gate). If preview renders exceed 10 ms consistently, stop and discuss before production.

Production has no admin yet: its first setup happens directly on `customseda-production-preview`, so Steps 1 and 4 do not apply there.
