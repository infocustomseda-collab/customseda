# Deployment and recovery

## Environment boundaries

- Account: the Custom Seda account identified in `wrangler.jsonc`.
- Top-level bindings are local-only; always select `staging` or `production` for remote commands.
- Production owns the only data: staging binds production's D1, R2 and SESSION KV and never migrates them (see [Workers per environment](#workers-per-environment)).
- Use a distinct `EMDASH_SITE_URL` per environment (staging and production keep their own origins). Do not set a fixed production `siteUrl` in Astro config: passkeys and CSRF need the actual environment origin.
- D1 IDs and R2 names are recorded in `wrangler.jsonc`; do not replace or reprovision them on each deploy. `validateTarget` refuses a staging config whose database, bucket or SESSION namespace differs from production's.
- Runtime migration mode is `check`; development is `auto`. Core migrations run through EmDash's CLI and D1 REST adapter on the deployment machine, outside a Worker HTTP invocation.
- Keep the starter seed small. It bootstraps an empty site; editing it does not migrate existing collections. The catalog model has a separate version marker. The deployment runner applies it through a Node CLI and Wrangler D1 binding proxy after core migrations, before Worker upload. The bulk schema is never applied through the deployed CMS HTTP endpoint. See [catalog migration boundaries](catalog-model.md#deployment-boundary).
- No sandbox runner or Worker Loader. These require Workers Paid.
- The hourly maintenance handler and Wrangler Cron expression must match. Scheduled publications and backups still need resource-budget testing; an hourly trigger does not promise Free-tier compatibility for large jobs.

## Workers per environment

An environment's `SITE_ROLE` selects its shape; `validateTarget` checks it before any deploy.

| Environment | Worker | Rendering | Data |
| --- | --- | --- | --- |
| Production | `customseda`, <https://customseda.customseda.workers.dev> | SSG storefront; the only CMS at `/_emdash/admin/` (passkeys); hourly cron | `customseda-production` D1 and R2, SESSION KV |
| Staging | `customseda-staging`, <https://customseda-staging.customseda.workers.dev> | Private SSR draft view; no CMS | production's D1, R2 and SESSION KV |

- **Production** (`SITE_ROLE=public`, built to `dist/`): prerendered pages from the snapshot of published content; CMS, API, checkout and original-media routes run server-side. `SSR_PREVIEW_URL` names staging for the “View site” handoff. It runs the hourly maintenance and dispatches rebuilds after publishes.
- **Staging** (`SITE_ROLE=preview`, built with `SITE_MODE=preview` to `dist-preview/`, `CMS_ORIGIN` = production): every page rendered on request from production's database, drafts included. `/_emdash/*` redirects to production, except `/_emdash/api/media/file/*`. No cron, no migrations, no payment records.

Admin passkeys are bound to the hostname that serves the admin: production's administrators register at `https://customseda.customseda.workers.dev/_emdash/admin/`.

### Staging access

Staging shows drafts to two kinds of visitors:

1. **Production editors** (Contributor and above) through “View site” in the production CMS. Production issues a one-minute, single-use ticket and staging loads the editor's session from the shared SESSION KV (`src/lib/cms/preview-route.ts`, `src/pages/preview/access.ts`).
2. **Reviewers** with the shared HTTP Basic credential: username `seda`, password `FOUNDATION_ACCESS_TOKEN` (staging Worker secret). One credential for everyone; rotate it to revoke access.

Everyone else gets `401` with a Basic challenge and a link to production's CMS login. `?_preview=` links alone do not open staging. Exempt from the gate: `/preview/access` (handoff), `/api/stripe/webhook` (signed by Stripe), `/_astro/*` and `/_emdash/api/media/file/*` (build assets and media are not confidential). All staging responses use `Cache-Control: private, no-store` and `X-Robots-Tag: noindex, nofollow`. `FOUNDATION_LOCKED` is `"true"` with `assets.run_worker_first`, and the gate itself runs in the Astro middleware (`src/lib/staging-access.ts`), where the editor session is known.

**Rollout — 2026-10-30:** staging now holds production's `EMDASH_ENCRYPTION_KEY` and is deployed as the shared reader (version `e5eb7893-9426-4614-9337-24d331294d82`, D1 `ef91b5bb…`, catalog model and core migrations current). Verified:
- anonymous `/` and `/?_preview=x` → 401 Basic, with `private, no-store` and `noindex`;
- a wrong token → 401;
- `seda` + token → 200;
- `/_emdash/admin` → 307 to production;
- `/preview/access` → 200;
- `/api/stripe/webhook` → 503, because no Stripe keys are set on staging yet.

Later the same day the user redeployed production; its Worker now runs the hourly cron and staging has none. The user also deleted the duplicate Worker `customseda-staging-staging` and the old D1 `customseda-staging`. Cloudflare now holds two Workers (`customseda`, `customseda-staging`) and one D1 (`customseda-production`).

Still open:
- draft visibility on staging is unverified, because production had no drafts;
- the bucket `customseda-staging-media` still exists.

Staging checkout uses Stripe **test** keys. Its webhook verifies events and flags address mismatches in Stripe, but never reads or writes `customseda_payment_events` (see [checkout](checkout.md)).

## Credentials

All secret files are ignored by git, have owner-only permissions (`chmod 600`), and follow the same layout as the fdag project:

| File | Holds | Used by |
| --- | --- | --- |
| `.env` | Local Worker secrets (`EMDASH_ENCRYPTION_KEY`, optional Stripe test keys) | `pnpm dev`. Wrangler reads `.env` as the local Worker's secrets; copy `.env.example`. |
| `.env.cloudflare-production` | Production's `EMDASH_ENCRYPTION_KEY` | Production, and the same key on staging (it reads production's encrypted settings and sessions). Not loaded automatically. |
| `.env.cloudflare-staging` | Production's `EMDASH_ENCRYPTION_KEY` (staging and `pnpm dev:staging` read production's data) and `FOUNDATION_ACCESS_TOKEN` (the shared reviewer credential) | Staging Worker and `pnpm dev:staging`. |

Never put a Cloudflare API token in `.env` or the `.env.cloudflare-*` files: those become Worker secrets, and the running site never needs an account token. Never create `.env.production`, `.env.development`, `.env.local` or `.env.staging`. Vite loads the first three into every `astro build`/`astro dev`, and Wrangler loads `.env.<environment>` into builds of that environment.

Manual deploys authenticate like fdag: run `pnpm exec wrangler login` once, then `pnpm deploy:<env>`. EmDash's core migrations run from the deploy, never inside the Worker, so they can't exceed Workers Free CPU limits (the problem fdag hit). `emdash migrate` needs a bearer token, so the runner hands it the token of your Wrangler login (`wrangler auth token`). In CI, `CLOUDFLARE_API_TOKEN` comes from the GitHub environment secret, and Wrangler uses it too. Use a custom token on this account with the "Edit Cloudflare Workers" template plus Account → D1 → Edit (and Workers R2 Storage → Edit if missing). Keep one token for manual use, stored in a password manager, and a second one as the GitHub environment secret, so either can be revoked alone.

Runtime secrets per Worker:

| Worker | Secrets |
| --- | --- |
| Production (`--env production`) | `EMDASH_ENCRYPTION_KEY`, live `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`, `GITHUB_REBUILD_TOKEN` |
| Staging (`--env staging`) | the **same** `EMDASH_ENCRYPTION_KEY` as production, `FOUNDATION_ACCESS_TOKEN`, **test** `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` |

Staging must never hold live Stripe keys. Back up encryption keys in a password manager before relying on encrypted settings. Upload each secret with `pnpm exec wrangler secret put <NAME> --env <env>`, after reviewing the selected environment. Subsequent deployments preserve remote secrets. With `FOUNDATION_LOCKED` set and no `FOUNDATION_ACCESS_TOKEN`, staging admits only editors arriving through “View site”.

### Static pages behind the gate

Public pages are prerendered static assets. Cloudflare serves those without running the Worker, so the gate would not cover them. While `FOUNDATION_LOCKED` is `"true"` (staging, permanently), the environment therefore sets `"assets": { "run_worker_first": true }` in `wrangler.jsonc`. Every request, pages and images included, then passes the gate, at the cost of one Worker invocation per request. `validateTarget` refuses a locked environment without it.

**Launch switch (phase 7):** set `FOUNDATION_LOCKED` to `"false"` and remove `run_worker_first` together. Pages are then served directly from static assets.

**Production access — 2026-10-30:** the production CMS setup was confirmed complete (`needsSetup: false`). At the user's request, production now has `FOUNDATION_LOCKED=false` and no `assets.run_worker_first`, so its storefront is public and its CMS uses normal EmDash authentication. The old foundation token secret may remain stored but is inactive.

Verified deployment `9e57af64-3fa6-4aab-adb4-243fe2b287c2`: anonymous `/` returns 200, `/_emdash/admin/` redirects to EmDash login, and the login page returns 200; none issues a Basic challenge. The production snapshot contains 16 products, 7 pages and 4 shipping rules. Deployment tests (19) and typecheck passed; no core migrations were pending.

Staging access is described in [Staging access](#staging-access).

## Build, migrate, deploy, check

```sh
pnpm deploy:staging
# Later, when production deployment is authorized:
pnpm deploy:production
```

Staging deploys read-only against production's database, and only production migrates it. Staging runs these steps:

1. Show migration status (read-only).
2. Check that every versioned catalog model marker is present in production's database (`remoteCatalogModel(target, { check: true })`).
3. Build with `SITE_MODE=preview` into `dist-preview/`.
4. Run `emdash migrate --check` against the build's manifest. If core migrations are pending, the deploy stops before the upload.
5. Deploy `dist-preview/server/wrangler.json`.

It needs no snapshot, derivatives or prerendering. Deploy production first whenever the change includes migrations, so staging's checks pass.

For production, the runner validates account, database and origins, then runs these steps with `CLOUDFLARE_ENV=production`:

1. Show the migration target and status (manifest built from the Astro config with `--from-config`, since no build exists yet).
2. Run core migration. It is interactive, unless `EMDASH_EXPECTED_TARGET_FINGERPRINT` holds the reviewed fingerprint, as in CI.
3. Apply the versioned catalog model through the explicitly selected D1 binding.
4. Write the published-content snapshot of that environment. The step refuses an empty catalog unless `--allow-empty` is passed, for a first deploy.
5. Generate WebP image derivatives from that environment's R2 (see [Images and build budget](#images-and-build-budget)).
6. Migrate a **local** stand-in of that environment's database. Prerendering runs EmDash in a local Worker, and EmDash refuses unmigrated databases; the remote database is not involved.
7. Build with `SITE_MODE=public` (pinned, whatever the shell exports). The build refuses a snapshot from another environment than `CLOUDFLARE_ENV` (`local` when unset).
8. Check the static output: every page must be an HTML document, never an EmDash error response.
9. Deploy the Worker: `wrangler deploy -c dist/server/wrangler.json`. The generated config is already flattened for the environment, so no `--env`.
10. Check core migration status against the build's manifest.

A failed command stops the sequence. No generic `deploy` command targets an implicit environment. The `emdash migrate` steps need `CLOUDFLARE_API_TOKEN` in the environment (see [Credentials](#credentials)); a Wrangler OAuth login is not enough.

The runner uses an atomic local lock for the entire checkout. If interrupted, confirm its recorded PID is no longer running before manually removing the stale `.emdash/deploy.lock`. Run one deployment job at a time per database. Catalog migration also holds the database option `customseda.catalog.migration-lock` across its versioned steps; inspect its owner and timestamp before considering removal of a stale lock. EmDash's database migration lock is an additional guard; it is not a deployment queue. CI serializes deploys per environment (see [Continuous deployment](#continuous-deployment-github-actions)) and passes the reviewed fingerprint through `EMDASH_EXPECTED_TARGET_FINGERPRINT`. Do not automatically accept a newly reported fingerprint without inspecting its target. The checkout lock does not span machines: do not run a manual deploy while the same environment's workflow is deploying.

For diagnosis or noninteractive jobs, use these version-matched CLI commands with the explicit account, UUID, and Wrangler environment from the config:

```sh
pnpm exec emdash migrate --status --account-id ACCOUNT_ID --d1 DATABASE_UUID --wrangler-config wrangler.jsonc --wrangler-env staging
pnpm exec emdash migrate --account-id ACCOUNT_ID --d1 DATABASE_UUID --wrangler-config wrangler.jsonc --wrangler-env staging --expected-target-fingerprint REVIEWED_FINGERPRINT
pnpm exec emdash migrate --check --account-id ACCOUNT_ID --d1 DATABASE_UUID --wrangler-config wrangler.jsonc --wrangler-env staging
```

The build writes `.emdash/migrations.json`; use it with the same installed dependencies and build artifact. Do not run `wrangler d1 migrations apply` as a substitute for EmDash's core migrations. Do not copy a local SQLite file or database dump over production as a deployment step.

## Continuous deployment (GitHub Actions)

**Administrator workstation setup — 2026-10-30:** the GitHub environments `production` and `staging` now hold `CLOUDFLARE_API_TOKEN` and the reviewed production target fingerprint. Both repository deployment flags are enabled. The read-only status check found no pending or unknown core migrations and executed none. Local validation passes after supplying the missing export-upload helper. With the user's explicit authorization, production now holds `GITHUB_REBUILD_TOKEN`, validated against the GitHub workflow API. The user confirmed that the copied hexadecimal encryption keys are current; both local files and remote Workers now use EmDash 1.3.1's canonical `emdash_enc_v1_` format, preserving the same 32 decoded bytes. Private local backups were retained, and the installed EmDash parser accepts both local files and confirms they share the same key. The restarted remote-connected dev server serves the homepage with HTTP 200 without the previous key-format error. CMS publish-to-rebuild acceptance and successful GitHub deployments still need verification; the PR's check was queued during setup. See [administrator workflow](administrator-workflow.md).

`.github/workflows/deploy.yml` runs on every push to `master`:

1. **verify:** `pnpm test` and `pnpm typecheck`.
2. **production:** `pnpm deploy:production`, only while the repository variable `PRODUCTION_DEPLOY_ENABLED` is `true`. Until then the job is **skipped**, not failed.
3. **staging:** `pnpm deploy:staging`, only after production succeeds in the same run and only while `STAGING_DEPLOY_ENABLED` is `true`. Staging reads production's database, so it never deploys code that production has not migrated for.

"Run workflow" in the Actions tab deploys one chosen environment from `master`. CMS publishes dispatch production only, see [Publishing and rebuilds](#publishing-and-rebuilds). Both jobs share the concurrency group `deploy-production-db`, so they never run against the shared database at the same time. A deploy never cancels a running one; at most one newer job waits, so several publishes in a row coalesce into one rebuild. A waiting job can be replaced by a newer one: if a production dispatch replaces a push's waiting staging job, run "Run workflow" for staging (or push again) to bring staging up to date.

One-time setup per environment, in GitHub → Settings → Environments (`staging`, later `production`):

- **Secret `CLOUDFLARE_API_TOKEN`:** a Cloudflare API token on this account with Workers Scripts edit, D1 edit and R2 read/write rights. `emdash migrate` requires an API token; OAuth logins do not work in CI.
- **Variable `EMDASH_TARGET_FINGERPRINT`:** the target fingerprint printed by `pnpm migrate:status <environment>` (read-only), reviewed by a person. Staging targets production's database, so both environments hold production's fingerprint. If the target changes, the deploy fails until someone reviews the new fingerprint and updates the variable.
- **Repository variable `STAGING_DEPLOY_ENABLED=true`:** set once the `staging` environment secret and fingerprint exist. Until then pushes only run tests and the staging job is skipped.
- **Repository variable `PRODUCTION_DEPLOY_ENABLED=true`:** set only after the supervised first production setup in phase 7 (secrets, administrator, reviewed fingerprint, Stripe keys).

Runtime secrets (see [Credentials](#credentials)) stay in Cloudflare (`wrangler secret put --env …`) and are never copied to GitHub. Manual deploys from a developer machine keep working (`pnpm deploy:production`, then `pnpm deploy:staging`). Do not run one while either workflow job is deploying.

## Publishing and rebuilds

Staging renders production's data on request, so a CMS change (draft or published) appears there immediately and staging is never rebuilt. Production's public pages are prebuilt, so a published change appears on the public site after the next production deploy. Three things trigger that deploy:

- **Publish, unpublish, delete or restore** of shop content (products, Conjuntos, lookups, size guides, site settings, pages, popups, shipping rules). The catalog plugin dispatches `deploy.yml` for production after the response, so the editor never waits.
- **Scheduled publishing and menu changes,** within the hour. EmDash's scheduled sweep runs no plugin hooks, and menus have no hook at all. Before each hourly sweep, the production Worker's scheduled handler checks two things: shop entries whose `scheduled_at` is due, which includes scheduled edits of live entries, and a fingerprint of the menus kept in `options`. It dispatches a rebuild if either changed.
- **On demand:** "Run workflow" in GitHub, or `POST /_emdash/api/customseda/rebuild` from an administrator session.

Bursts coalesce before any job starts: waiting dispatch runs for an environment replace each other. A deploy always checks out the current `master`. A failed build or deploy leaves the previous site serving; check the Actions tab.

The workflow is dispatched with a **fine-grained personal access token**, scoped to the `infocustomseda-collab/customseda` repository with "Actions: read and write" permission and nothing else. Store it as a secret of the production Worker (the CMS and the rebuild trigger run there):

```sh
pnpm exec wrangler secret put GITHUB_REBUILD_TOKEN --env production
```

`DEPLOY_ENVIRONMENT` and `GITHUB_REPOSITORY` are set as Worker vars in `wrangler.jsonc`. Local development has neither, so it never dispatches.

| Token | Owner | Expires | Renewal |
| --- | --- | --- | --- |
| `GITHUB_REBUILD_TOKEN` (production CMS Worker) | `infocustomseda-collab` | 2027-01-28 00:00 UTC (reported by GitHub) | Create a new token with the same scope, run `wrangler secret put` again, then delete the old token |

When the token expires, publishes still succeed but nothing rebuilds. The Worker logs show `Rebuild request failed … GitHub 401`. Renew the token before its expiry date.

**Deployment acceptance — 2026-10-31:** both repository deployment flags were verified as `true`. [Master deployment 41156877509](https://github.com/infocustomseda-collab/customseda/actions/runs/41156877509) completed verification, production and staging successfully, with staging starting after production completed. This closes the successful GitHub deployment check left open in the administrator workstation setup note above. CMS publish-to-rebuild acceptance remains pending: verify a real approved content and media change, production-only dispatch, and draft privacy after backups are in place.

## Images and build budget

Each deploy writes WebP derivatives (480, 960 and 1440 px, never upscaled) for every image the snapshot references. The originals come from that environment's R2 through a binding, not over HTTP. The derivatives go to `public/media/` and the snapshot's image values are annotated, so pages get `srcset` and `sizes`. Results are cached by content hash in `.cache/media` (locally and through `actions/cache` in CI).

- If an original is missing in R2 or sharp cannot decode it, it is reported and keeps its original `/_emdash/api/media/file/…` URL. The page still works, only heavier.
- New uploads appear with derivatives after the rebuild that publishing triggers.

The build fails above 15,000 derivative files, or for any file over 25 MiB (Free limits: 20,000 files and 25 MiB per asset).

Worker upload after phase 6: 19.1 MiB, 5.0 MiB gzip (`wrangler deploy --dry-run`; phase 1 recorded about 4.9 MiB gzip). Phase 1 deployed staging at that size, but it is above the commonly documented 3 MB compressed Workers Free limit. The phase 7 Free-tier gate must confirm the current limit.

Measured locally on 2026-10-25 against the imported catalog (drafts, 11 products, 5 Conjuntos, 7 pages):

- 94 originals produced 271 files, 22.2 MiB in total.
- The cold run took 15.5 s and the cached run 1.9 s. `astro build` itself takes about 10 s.
- One product photo: 3.1 MB original against 62 KB at 960 px.

## Free-tier feasibility gate

Test remote setup, passkey login, content create/edit/publish, relation writes, realistic image uploads, and redeployment. Inspect invocation CPU and outcome, not merely HTTP status or build success. Requests occasionally receive CPU headroom, so a request exceeding 10 ms that succeeds is not evidence of a sustainable Free workload. Cloudflare rejected an explicit CPU cap with error 100328 because custom CPU caps are unavailable on Workers Free. Staging therefore uses the platform default. Do not raise the budget by upgrading the plan without discussing it.

Use `pnpm exec wrangler tail --env staging --format json` locally for diagnosis. Logs can include request headers and visitor metadata; keep raw logs out of Git and share only redacted summaries. The subscription-list endpoint was unavailable to the existing token, but error 100328 independently identified this account as Workers Free.

## Backup and recovery

Before a migration, record a recovery point and the matching application version:

```sh
pnpm exec wrangler d1 time-travel info DB --env staging --json
```

D1 Time Travel retention is limited (currently 7 days on Free). Media objects and encryption keys require separate backups.

**Do not use a plain `wrangler d1 export` for this schema:** EmDash's FTS5 virtual tables make that fail. Follow the [official FTS-aware offsite export](https://docs.emdashcms.com/guides/backups/#create-an-offsite-d1-dump):

1. Enumerate ordinary tables, excluding `_emdash_fts_*`, `sqlite_*`, and `_cf_*` tables.
2. Export schema, media-folder rows, remaining rows, and user indexes/triggers to separate files.
3. Check for SQL statements >=100,000 bytes before attempting a D1 import.
4. Restore into an empty recovery database in that order and validate integrity/foreign keys.
5. Rebuild the search index via the restored site's search API.

The staging export is stored under ignored `backups/`. Its restore to an isolated local SQLite database passed integrity/foreign-key checks and retained all 90 core migration records. A remote D1 restore and full application/auth/media recovery rehearsal remain pending. JSON content exports are not complete database recovery points.

Remote Time Travel restore rewinds data and cancels active queries. It requires explicit approval: the automatic approval review rejected our staging rehearsal because changes after the bookmark could be discarded. No restore or marker-table mutation was executed. Record the pre-restore undo bookmark if a rehearsal is subsequently authorized.

For media backups, copy R2 objects to separate storage using scoped R2/S3 credentials. Restore to an empty recovery bucket; verify known URLs before changing a production binding. Preserve the encryption-key rotation list separately from both database and media backups.

## Failed migrations

1. Stop other deployment jobs for that database.
2. Run `emdash migrate --status` against the exact same account/UUID to distinguish completed, pending, unknown, or locked state.
3. If a process stopped, confirm it is no longer running before considering lock takeover. Do not clear a live lock or delete migration records.
4. Use the official CLI's reviewed-target `--take-over-lock LOCK_ID` recovery when appropriate.
5. If code/schema rollback is needed, restore the matching database, application artifact, media, and keys together after approval. Deploying old code does not undo forward-only migrations.

References: [EmDash core migrations](https://docs.emdashcms.com/deployment/core-migrations/), [Cloudflare deployment](https://docs.emdashcms.com/deployment/cloudflare/), [backups](https://docs.emdashcms.com/guides/backups/).
