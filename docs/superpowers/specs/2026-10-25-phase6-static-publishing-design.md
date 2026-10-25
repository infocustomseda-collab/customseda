# Phase 6 design: static shop, CI deploys, publish-triggered rebuilds

Date: 2026-10-25. Agreed with the user in chat. Extends phase 6 of the [plan](../plans/2026-10-24-custom-seda.md).

## Intent

The public shop should be a static site wherever possible ("SSG with dynamic parts where needed"). Visitors receive prebuilt files with no database reads per page. The merchant adds new bikinis about once a month. A delay of several minutes before a publish or price change goes live is acceptable.

Code reaches Cloudflare automatically: every push to `master` deploys staging and then production. The existing manual deploy commands keep working. A CMS publish rebuilds and redeploys its own environment.

## Goals

1. **Prerendered public pages** built from a snapshot of published content:
   - home (`/`);
   - collection listings (`/collections/<handle>`), product and Conjunto pages (`/products/<slug>`);
   - Margarita and content pages (`/pages/<slug>`, `/pages/contact`, `/pages/margarita`), `/blogs/noticias`, `/policies/<slug>`;
   - the branded 404.

   The popup and announcement bar are baked in; their date windows and dismissal already run in the browser.
2. **Live Worker routes only where needed:**
   - EmDash admin and API (`/_emdash/*`) and media files;
   - `/api/checkout`, which keeps revalidating price, availability, sizes and shipping against D1 at purchase time, so a stale static page can never charge a wrong price;
   - `/api/stripe/webhook`;
   - `/checkout/gracias` (asks Stripe for the session state) and `/checkout/cancelado`. They render their header and footer from the build snapshot, not from per-request database reads.
3. **GitHub Actions deploy:** on every push to `master`:
   - run tests, typecheck and build;
   - deploy **staging**, then deploy **production automatically** if staging succeeded;
   - a manual "Run workflow" button deploys one chosen environment from `master`.
4. **Manual deploy stays:** `pnpm deploy:staging` / `pnpm deploy:production` keep working from a developer machine with the same validation, migrations and checks.
5. **Publish-triggered rebuild per environment:**
   - publishing or unpublishing content, updating published content, deleting content, or changing settings or menus in an environment's admin starts the deploy workflow for **that environment only**, using the current `master` code;
   - publishes made in quick succession share rebuilds;
   - a failed build or deploy leaves the previously deployed site serving.
6. **Images:**
   - build-time responsive derivatives (modern formats, bounded widths, explicit dimensions, correct `sizes`, lazy loading below the fold);
   - measured media size and build duration against Free quotas;
   - a documented fallback for new uploads or failed processing.
7. **Transitions and PWA:**
   - view transitions from product cards to detail photos and titles, with stable unique names, browser fallback and reduced-motion support;
   - popup lifecycle verified across navigation and back/forward;
   - PWA manifest, icons, a service worker with an offline fallback, and update behavior;
   - admin, `/api/*`, `/checkout/*`, webhook responses, and authoritative price/availability are never cached by the service worker; checkout is online-only.

## Non-goals

- Instant publishing or per-request freshness of public pages.
- The cart (phase 8).
- Staging/production acceptance, Free-tier CPU measurement, recovery rehearsal, SEO and domain cutover. These remain phase 7, though deploys now run earlier.
- Preview of drafts on the deployed site. Drafts stay visible only in local development and in the admin.

## Anti-goals

These would make the work a failure even if it technically works:

- Staging content, media URLs or secrets appearing in a production build, or the other way round.
- A public page doing D1 reads per request, except the live routes listed above.
- A static price or availability being trusted at checkout.
- Secrets in the repository, in the client bundle, or inlined with `import.meta.env`. Cloudflare runtime secrets (`EMDASH_ENCRYPTION_KEY`, Stripe, `FOUNDATION_ACCESS_TOKEN`) are not copied into GitHub.
- Two deploys running against the same database at once.
- Automatically accepting a new, unreviewed EmDash migration target fingerprint.
- Copying a local database over a remote one as part of deploying.
- Enabling sandboxed plugins or Worker Loader bindings.

## Constraints

- pnpm, Astro 7.4, EmDash 1.3.1, `@astrojs/cloudflare` 14, Wrangler 4, Workers Free. No Tailwind. Preserve the approved identity.
- Read [AGENTS.md](../../../AGENTS.md) and [deployment.md](../../deployment.md). Remote core migrations run from the CLI before deploying; `migrations.runtime` stays `check`. The runner's order is build → migration status → core migration → catalog model → `wrangler deploy` → migration check. Keep its target-separation validation and lock.
- For noninteractive migration, CI passes the **reviewed** `--expected-target-fingerprint` for each environment, stored as a GitHub environment variable. A changed fingerprint fails the job for a human to review.
- CI must serialize per environment, one deploy per database at a time. GitHub concurrency groups per environment are acceptable; a queued run should replace an older queued run (that is how rebuilds coalesce).
- The staging and production foundation gate (`FOUNDATION_LOCKED`) stays on. Build-time reads must not depend on HTTP access to the gated Worker.
- Worker static assets limits on Free: 20,000 files and 25 MiB per file. Generated image derivatives count toward them.
- The Worker bundle is already about 5 MiB gzip. Do not grow it materially; record the size after this phase.
- Local development keeps working as today: `pnpm dev` shows local drafts live, and the dev-only `/design/*` routes stay dev-only.

## Decided by the user

- Static site with dynamic parts only where needed.
- Publish latency of minutes is fine; publishing is roughly monthly.
- GitHub Actions deploys on push to `master`: staging, then production **automatically, without an approval step**.
- Manual local deploys remain available.
- Rebuilds after a CMS publish (proposal accepted): each environment rebuilds only itself from the current `master` code. Publishes close together share a rebuild. A failed build keeps the old site.
- Popup and announcement bar are prerendered; the checkout reason message comes from the existing browser script on static pages.
- **Production is built but switched off.** The workflow contains the production job, but it runs only when a GitHub repository or environment setting (for example `PRODUCTION_DEPLOY_ENABLED=true`) is turned on. That happens after a supervised first production setup in phase 7: secrets, reviewed fingerprint, administrator and Stripe keys. Until then, pushes deploy staging only and the production job is skipped. It does not fail.
- **Everything stays behind the foundation gate until launch.** While `FOUNDATION_LOCKED` is `true`, every request, including static pages and image derivatives, runs through the Worker so the gate applies (for example with `run_worker_first`). The per-view Worker cost is accepted only before launch. At launch (phase 7) the gate is removed and static assets are served directly. Make that switch a single, documented configuration change. The Stripe webhook needs the gate's Basic credentials in its URL, as in [checkout.md](../../checkout.md).
- **The Shopify catalog is imported into staging in this phase,** so publishing, rebuilds and images can be verified remotely. Use the existing import logic (`scripts/import/`, `src/lib/cms/shopify-import.ts`) against staging's D1 and R2 through explicit remote bindings, as `remote-model.mjs` does, with a dry run first and the existing verification report. It must be idempotent on retry. Never copy the local database. It does not depend on the merchant's staging passkey.
- **The rebuild token is a fine-grained personal token** from one maintainer's account. It is limited to this repository with Actions write access and stored as a Worker secret per environment. The operations guide records its owner, expiry date and renewal steps. If it has expired, the trigger logs the failure; the admin cannot show it.

## Builder calls already made

These were made by Claude after the design review, not decided by the user:

- **Deploy order:** core migration status and apply, then catalog model, then content snapshot, then build, then `wrangler deploy`, then migration check. The snapshot must read the migrated schema. A build failing after a migration leaves the database as today's runner already can (migrated, old code serving); model versions are additive. Update the runner's ordering tests to match.
- **Empty-snapshot guard:** the build refuses to deploy when the snapshot has no published products or Conjuntos, unless an explicit flag allows it for a first deploy. A bad read or wrong binding can then never replace the shop with an empty one.

## Left to the builder

These are proposals, not requirements:

- **Snapshot mechanism.** One proposal: a Node step before `astro build` reads the target environment's published rows through a remote D1 binding (as `scripts/cms/remote-model.mjs` already does) and writes a generated JSON in the shape of `ShopContent` plus menus. Pages read it at build time, and local dev keeps reading live data with drafts.
- **Image derivatives.** Source originals from that environment's R2 (via binding, not the gated HTTP origin), and choose where the derivatives live (proposal: static assets).
- **Rebuild trigger.** Proposal: an EmDash native plugin hook calls GitHub's `workflow_dispatch` through `ctx.waitUntil` with a fine-grained token (Actions write on this repository only), stored as a Worker secret per environment. The workflow's concurrency group coalesces bursts.
- **Workflow structure:**
  - two jobs with `needs`, using GitHub environments `staging` and `production` that hold `CLOUDFLARE_API_TOKEN` and the reviewed fingerprint;
  - the runner gains a noninteractive mode;
  - the deploy lock works on CI runners.
- **Service worker strategy** and the update prompt.
- **Splitting the work into PRs**, as in phase 4.

## Changes to project rules

AGENTS.md and the plan currently defer all staging and deployment work to phase 7. The user has now authorized automated staging and production deploys from `master` and publish-triggered rebuilds, so update both. Phase 7 keeps the acceptance gate, CPU measurement, recovery rehearsal and cutover.
