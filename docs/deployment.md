# Deployment and recovery

## Environment boundaries

- Account: the Custom Seda account identified in `wrangler.jsonc`.
- Top-level bindings are local-only; always select `staging` or `production` for remote commands.
- Use a distinct `EMDASH_SITE_URL` per environment. Do not set a fixed production `siteUrl` in Astro config: passkeys and CSRF need the actual environment origin.
- D1 IDs and R2 names are recorded in `wrangler.jsonc`; do not replace or reprovision them on each deploy.
- Runtime migration mode is `check`; development is `auto`. Core migrations run through EmDash's CLI and D1 REST adapter on the deployment machine, outside a Worker HTTP invocation.
- Keep the starter seed small. It bootstraps an empty site; editing it does not migrate existing collections. The catalog model has a separate version marker. The deployment runner applies it through a Node CLI and Wrangler D1 binding proxy after core migrations, before Worker upload. The bulk schema is never applied through the deployed CMS HTTP endpoint. See [catalog migration boundaries](catalog-model.md#deployment-boundary).
- No sandbox runner or Worker Loader. These require Workers Paid.
- The hourly maintenance handler and Wrangler Cron expression must match. Scheduled publications and backups still need resource-budget testing; an hourly trigger does not promise Free-tier compatibility for large jobs.

## Credentials

`pnpm exec wrangler login` configures Wrangler authentication. EmDash's remote migration CLI additionally requires `CLOUDFLARE_API_TOKEN` in the deployment process; use a scoped token with D1 Edit for this account. Never put it in source or client code. The initial verification used existing Wrangler OAuth credentials only in child-process environment variables; no token was copied into the repository.

Runtime secrets are `EMDASH_ENCRYPTION_KEY` and, while the temporary gate is enabled, `FOUNDATION_ACCESS_TOKEN`. Separate local/staging/production files were generated and are ignored, with owner-only file permissions. Back up encryption keys in a password manager before relying on encrypted settings.

For the first deployment of an environment, upload its secrets through Wrangler, for example:

```sh
pnpm exec wrangler secret bulk .dev.vars.production --env production
```

Review the selected environment and secret file first. Subsequent deployments preserve remote secrets. The gate fails closed with 503 if locked and the access secret is missing. Do not turn it off until setup is complete and the intended exposure has been reviewed.

## Build, migrate, deploy, check

```sh
pnpm deploy:staging
# Later, when production deployment is authorized:
pnpm deploy:production
```

The runner validates account/database/origin separation, builds with the selected `CLOUDFLARE_ENV`, displays the migration target, runs interactive core migration, applies the versioned catalog model from Node through the explicitly selected D1 binding, deploys that same build, and checks core migration status. A failed command stops the sequence. No generic `deploy` command targets an implicit environment.

The runner uses an atomic local lock for the entire checkout. If interrupted, confirm its recorded PID is no longer running before manually removing the stale `.emdash/deploy.lock`. Run one deployment job at a time per database. Catalog migration also holds the database option `customseda.catalog.migration-lock` across its versioned steps; inspect its owner and timestamp before considering removal of a stale lock. EmDash's database migration lock is an additional guard; it is not a deployment queue. Any future CI must serialize by account + database UUID and provide the reviewed `--expected-target-fingerprint` for noninteractive migration. Do not automatically accept a newly reported fingerprint without inspecting its target.

For diagnosis or noninteractive jobs, use these version-matched CLI commands with the explicit account, UUID, and Wrangler environment from the config:

```sh
pnpm exec emdash migrate --status --account-id ACCOUNT_ID --d1 DATABASE_UUID --wrangler-config wrangler.jsonc --wrangler-env staging
pnpm exec emdash migrate --account-id ACCOUNT_ID --d1 DATABASE_UUID --wrangler-config wrangler.jsonc --wrangler-env staging --expected-target-fingerprint REVIEWED_FINGERPRINT
pnpm exec emdash migrate --check --account-id ACCOUNT_ID --d1 DATABASE_UUID --wrangler-config wrangler.jsonc --wrangler-env staging
```

The build writes `.emdash/migrations.json`; use it with the same installed dependencies and build artifact. Do not run `wrangler d1 migrations apply` as a substitute for EmDash's core migrations. Do not copy a local SQLite file or database dump over production as a deployment step.

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
