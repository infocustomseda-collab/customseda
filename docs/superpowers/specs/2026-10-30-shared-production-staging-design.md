# Staging as a private SSR view of production

Supersedes [2026-10-30-two-worker-design.md](2026-10-30-two-worker-design.md) where they differ. The data-transition choice in that spec is settled: production's D1/R2 already hold the catalog (16 products, 7 pages, 4 shipping rules in the production snapshot), and staging's own D1/R2 are retired.

## Intent

Production is the only CMS and the only data. Staging stops being a separate site with its own content. It becomes a private, server-rendered window onto production's database, so editors and invited reviewers can see drafts exactly as they will look before a publish triggers the static rebuild.

## Target state

| URL | Behavior |
| --- | --- |
| `https://customseda.customseda.workers.dev` | SSG storefront from the build-time snapshot of published content. Public. Checkout, webhook, original media and CMS APIs stay server-side (unchanged). |
| `https://customseda.customseda.workers.dev/_emdash/admin/` | The only EmDash admin. Normal EmDash authentication (passkey). Unchanged. |
| `https://customseda-staging.customseda.workers.dev` | SSR storefront reading **production's** D1 and R2. Shows drafts. Private. |
| `https://customseda-staging.customseda.workers.dev/_emdash/admin` | Removed. Any `/_emdash/*` path other than `/_emdash/api/media/file/*` redirects to production (this redirect already exists in `src/worker.ts` when `CMS_ORIGIN` is set). |

## Staging access (decided by the user)

Two ways in, both see drafts:

1. **From the CMS:** the production admin's “View site” goes through the existing handoff (`src/lib/cms/preview-route.ts` → `/preview/access` on staging). The single-use ticket in production's `options` table and the shared `SESSION` KV are kept as they are. The resulting staging request has an EmDash editor session.
2. **User + token:** one shared credential for everyone, for now. Reuse the existing Basic gate (`src/lib/foundation-access.ts`, user `seda`, secret `FOUNDATION_ACCESS_TOKEN`) as the second way in. Per-person accounts are out of scope.

A request is allowed if it has an editor session (role ≥ Contributor) **or** valid Basic credentials. Either one grants draft visibility. Otherwise:

- Show the browser's Basic prompt (401 with `WWW-Authenticate`). The 401 page body links to production's CMS login so editors can take the “View site” route instead. (Builder's call on the exact wording.)
- Never redirect to staging's own login, which no longer exists.

Exempt from the gate:

- `/preview/access`, GET and POST, so the CMS handoff works without Basic credentials;
- `/api/stripe/webhook`, which Stripe calls and which is protected by its signature;
- static build assets needed by those pages (`/_astro/*`).

All gated responses and private pages keep `Cache-Control: private, no-store` and `X-Robots-Tag: noindex, nofollow`.

Because Basic auth now has to sit alongside session access, the gate can no longer be the all-or-nothing `foundationAccess` check at the top of `fetch`. On staging it moves to (or is consulted from) the preview middleware, where `locals.user` is known. Production keeps `FOUNDATION_LOCKED=false`.

## Staging and orders (decided by the user)

The rule is narrow: **staging must never write order data to production.** Other writes to production storage that come from the handoff (consuming the ticket, session KV) are acceptable.

- Staging uses **Stripe test mode**: its own `STRIPE_SECRET_KEY` (`sk_test_…`) and `STRIPE_WEBHOOK_SECRET` from a test webhook endpoint at `https://customseda-staging.customseda.workers.dev/api/stripe/webhook`.
- Staging's webhook verifies the signature and still flags address mismatches on the PaymentIntent in Stripe (test mode). It **never** reads from or writes to `customseda_payment_events`, and it never touches anything else order-related. Without the dedup record, a retried event repeats the address flag, which is already idempotent.
- How staging is recognized is the builder's call (for example, the presence of `CMS_ORIGIN` or an explicit var). It must fail safe: if staging is misconfigured, the webhook records nothing.
- Checkout keeps re-reading the **published** entry (`docs/checkout.md` step 2). A product that is only a draft can be previewed but not bought on staging. Edits to a published product check out at the published price.
- A test proves that the staging webhook path issues no statement against `customseda_payment_events`.

Orders remain in Stripe Dashboard → Payments; there is no orders screen in the CMS (by design, see `docs/checkout.md`).

## Configuration changes (`wrangler.jsonc`)

Staging (`env.staging`):

- `d1_databases` → production's `customseda-production` (`ef91b5bb-…`); `r2_buckets` → `customseda-production-media`; add the production `SESSION` KV namespace (`f182e3b1…`) so handoff sessions load.
- `vars`: keep `SITE_ROLE=preview` and `EMDASH_SITE_URL` = staging origin. Add `CMS_ORIGIN=https://customseda.customseda.workers.dev`. Set `FOUNDATION_LOCKED=true` (Basic is now required unless there's an editor session). Today `PRIVATE_SITE` with `CMS_ORIGIN` already redirects anonymous visitors to production's `/_emdash/admin/login` and already exempts `/preview/access`. The change is to replace that redirect with the 401 Basic challenge. Whether `PRIVATE_SITE` is removed or redefined is the builder's call.
- Since the gate is now on, `assets.run_worker_first: true` (existing rule in `validateTarget`).
- `triggers.crons: []`. `scheduled` already returns early when `CMS_ORIGIN` is set.
- Remove the `send_email` binding unless staging still needs it (builder checks whether anything on staging sends mail; with no admin, likely not).

Production (`env.production`):

- `triggers.crons: ["0 * * * *"]`. Production now owns scheduled publishing, menu-change rebuild detection and the hourly maintenance sweep.
- `GITHUB_REBUILD_TOKEN` becomes a secret of the production Worker (the single CMS host).

Secrets on staging: `EMDASH_ENCRYPTION_KEY` **identical to production's** (it reads the same encrypted settings and sessions), `FOUNDATION_ACCESS_TOKEN` (the shared reviewer token), and Stripe **test** keys. Staging must never hold live Stripe keys.

## Deployment changes

- **Validation (`scripts/deploy/target.mjs`):** today it requires distinct databases and buckets between environments. Replace that with the new invariant: staging's D1, R2 and SESSION bindings must equal production's, and staging must set `CMS_ORIGIN` to production's origin. Production must keep `SSR_PREVIEW_URL` = staging origin. Staging's `EMDASH_SITE_URL` must still differ from production's.
- **Migrations are production's job only.** `pnpm deploy:staging` runs no core, catalog or checkout migrations. It is read-only against the shared database. It refuses to deploy if (a) `emdash migrate --check` reports pending core migrations, or (b) any of the repo's versioned model markers (catalog model versions, `customseda.checkout.v1`) that the build expects is missing from production's `options`. Reading those markers is enough; it never applies them. *(Planner's call.)*
- **Fingerprint:** staging's check targets production's database, so the `staging` GitHub environment's `EMDASH_TARGET_FINGERPRINT` is replaced with production's reviewed fingerprint. The old staging-DB value is removed. *(Planner's call.)*
- **Order and gating in CI** *(planner's call):*
  - The staging job runs after the production job (`needs: production`), and only if production succeeded in that run. If production fails, is cancelled or is skipped, staging doesn't deploy.
  - A manual "Run workflow" for staging alone is still allowed; the read-only checks above protect it.
  - CMS publish dispatches and the hourly rebuild deploy production only. Staging renders on request and needs no rebuild.
- **No concurrent deploys against the shared database:** the staging and production jobs share one concurrency group, `deploy-production-db`, with no cancellation. The local deploy lock stays as it is for manual runs, and manual deploys must not run while CI is deploying either environment. *(Planner's call.)*
- `deploy:staging` builds with `SITE_MODE=preview` as now. No snapshot or derivatives.

## Rollout order (decided by the user)

1. **Before production gets the hourly cron**, inspect the leftover remote `production-preview` Worker read-only (bindings, cron triggers). Then delete it. It may still run an hourly sweep against production's D1, and two sweeps would double scheduled publishing and rebuild requests.
2. Deploy production (cron added, rebuild token on this Worker).
3. Deploy the new staging and verify it.
4. Retire staging's own resources (below).

## Retiring staging's own resources

After the new staging is deployed and verified:

1. Export a backup of `customseda-staging` (D1) and list `customseda-staging-media` (R2) into `backups/`. Keep the backup; it is ignored by git.
2. Confirm with the user, then delete D1 `customseda-staging` and R2 `customseda-staging-media`.
3. Delete the old staging Stripe test webhook endpoint if its URL or secret changes. Confirm with the user first.

Remote deletion is irreversible and is never automatic or part of a deploy script.

## Documentation

Update together with the code:

- `AGENTS.md`: the runtime section. Replace “Staging and production must have distinct databases, buckets, origins, and secrets” with the shared-data model. Staging is the SSR draft view of production, with its own origin, distinct Stripe test keys, and no CMS. Remove references to the `production-preview` Worker.
- `docs/deployment.md`: the Workers table, staging access, secrets per Worker, cron ownership, deploy order and the staging migration check. Also fix the stale “legacy” paragraphs about staging having its own D1/R2.
- `docs/checkout.md`: staging records no payment events.
- `README.md` where it describes environments.

## Non-goals

- Per-person reviewer accounts or revoking a single reviewer.
- Any CMS functionality on staging.
- Changing production's public/static behavior or its admin authentication.
- Order screens in the CMS.

## Verification

- Unit tests: gate decisions (session, Basic, neither, exempt paths); staging webhook issues no `customseda_payment_events` statements; deploy target validation for the new invariant; the staging deploy refuses with pending migrations.
- `pnpm test`, `pnpm typecheck`, both builds.
- After deploy, check staging: anonymous → 401; Basic → page with drafts; “View site” from the production admin → page with drafts, without a Basic prompt; `/_emdash/admin` → production; test-mode checkout of a published product completes and its webhook returns 200 without a DB record. Check production: anonymous `/` → 200 static; admin → passkey login; hourly cron listed on the production Worker.

## Builder's calls

Builder's calls: the wording of the 401 page, how staging is detected in the webhook (must fail safe), the CI job layout within the ordering above, and whether `PRIVATE_SITE` is removed or redefined.

Planner's calls (made while writing the plan, open to the user's review): the staging migration and model-marker check, the fingerprint, the CI ordering and gating, and the shared concurrency group.
