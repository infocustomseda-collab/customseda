# Shared-production staging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Staging becomes a private SSR draft view of production's D1/R2. Visitors get in with a production CMS editor session (handed off by “View site”) or the shared Basic credential. Staging has no admin, migrates nothing and records no payment events. Production keeps its static public site and passkey admin, and takes over the hourly cron.

**Architecture:** On staging (`CMS_ORIGIN` set, built with `SITE_MODE=preview`), the Worker skips its blanket Basic gate. The Astro preview middleware applies `stagingAccess`, which accepts an editor session or Basic credentials, exempts the handoff, webhook, build-asset and media paths, and otherwise returns 401 + Basic. The webhook skips the dedup table whenever the build is `preview` or `CMS_ORIGIN` is set. Deploy validation now requires staging to share production's bindings. Staging deploys only after the build, against read-only checks: catalog model markers and `emdash migrate --check`.

**Tech Stack:** Astro 6 + `@astrojs/cloudflare`, EmDash 1.3.1, Cloudflare Workers/D1/R2/KV, Wrangler, `node --test`, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-30-shared-production-staging-design.md`

## Global Constraints

- Staging must never read or write `customseda_payment_events`; its Stripe keys are test mode only.
- Staging: `SITE_ROLE=preview`, `CMS_ORIGIN=https://customseda.customseda.workers.dev`, `FOUNDATION_LOCKED=true`, `assets.run_worker_first: true`, `triggers.crons: []`, D1 `ef91b5bb-deb3-4984-93ee-83b2df4e5083`, R2 `customseda-production-media`, KV `SESSION` `f182e3b1d1124efcaee5621f17efe31b`.
- Production: `triggers.crons: ["0 * * * *"]`, `FOUNDATION_LOCKED=false`, no `run_worker_first`, `SSR_PREVIEW_URL=https://customseda-staging.customseda.workers.dev`.
- Basic user is `seda`, secret `FOUNDATION_ACCESS_TOKEN` (unchanged credential format).
- Staging gated responses: `Cache-Control: private, no-store`, `X-Robots-Tag: noindex, nofollow`.
- Gate-exempt staging paths: `/preview/access`, `/api/stripe/webhook`, `/_astro/*`, `/_emdash/api/media/file/*`.
- No remote command (deploy, secret, delete) runs outside Task 6, and each one there needs the user's explicit go-ahead.
- Code style: match the surrounding file (compact style in `src/lib/cms/*` and `src/pages/preview/*`, regular formatting elsewhere).

## Review Focus

1. A Basic header with the right token but a different user, or with wrong case or extra whitespace, must get 401, never drafts. (Task 1 test)
2. An expired or disabled editor session with no Basic credentials gets 401 with the production-login link, not a 500 or a redirect loop. (Task 1 test: `editor=false` path)
3. A visitor who came in through “View site” (session only, no Basic) still loads product images from `/_emdash/api/media/file/*`. (Task 1 exemption test)
4. A `?_preview=` link without credentials gets 401, not the draft. (Task 1 test)
5. A staging deploy whose shared database lacks a catalog model marker the code expects stops before any upload. (Task 3 command-order test)

---

### Task 1: Staging access gate

**Files:**
- Modify: `src/lib/foundation-access.ts` (export a boolean credential check; `foundationAccess` reuses it)
- Create: `src/lib/staging-access.ts`
- Modify: `src/middleware.ts`, `src/worker.ts:12-13`
- Modify: `src/lib/preview-routing.ts` (remove the `privateSite` parameter and branch)
- Test: `tests/staging-access.test.mjs` (new), `tests/foundation-access.test.mjs`, `tests/preview-routing.test.mjs` (delete the two `private staging …` tests)

**Interfaces:**
- Produces: `hasFoundationCredentials(request: Request, token: string | undefined): boolean`. False when the token is missing. Timing-safe comparison of `Authorization` or `X-Foundation-Access` against `Basic base64("seda:" + token)`.
- Produces: `stagingAccess(request: Request, env: { FOUNDATION_ACCESS_TOKEN?: string; CMS_ORIGIN: string }, editor: boolean): { drafts: boolean } | Response`

Decisions:
- `PRIVATE_SITE` is removed everywhere: the var, the `previewRedirect` parameter and the middleware.
- `src/worker.ts` calls `foundationAccess` only when `CMS_ORIGIN` is not a string. If `CMS_ORIGIN` is missing on staging, the blanket gate still applies, so it fails closed.
- In `src/middleware.ts`, when `mode === 'preview'` and `CMS_ORIGIN` is set, call `stagingAccess(context.request, env, canPreviewDrafts(context.locals.user?.role))`:
  - a `Response` is returned as is;
  - otherwise drafts are visible when `result.drafts`;
  - the private cache and robots headers are set on every response.
- `previewRedirect` is not used on this path.

- [ ] **Step 1: Write the failing tests** in `tests/staging-access.test.mjs`:

```js
const env = { FOUNDATION_ACCESS_TOKEN: 'a'.repeat(64), CMS_ORIGIN: 'https://cms.example' };
const req = (path, auth) => new Request(`https://staging.example${path}`, { headers: auth ? { Authorization: auth } : {} });
const basic = (user, pass) => `Basic ${btoa(`${user}:${pass}`)}`;

test('editor session sees drafts without Basic', () => assert.deepEqual(stagingAccess(req('/'), env, true), { drafts: true }));
test('Basic reviewer sees drafts', () => assert.deepEqual(stagingAccess(req('/', basic('seda', env.FOUNDATION_ACCESS_TOKEN)), env, false), { drafts: true }));
test('anonymous, wrong user, wrong token and preview links get a private 401 Basic challenge linking to the CMS login', async () => {
  for (const r of [req('/'), req('/?_preview=x'), req('/', basic('Seda', env.FOUNDATION_ACCESS_TOKEN)), req('/', basic('seda', 'wrong')), req('/', `${basic('seda', env.FOUNDATION_ACCESS_TOKEN)} `)]) {
    const res = stagingAccess(r, env, false);
    assert.equal(res.status, 401);
    assert.match(res.headers.get('WWW-Authenticate'), /^Basic /);
    assert.equal(res.headers.get('Cache-Control'), 'private, no-store');
    assert.equal(res.headers.get('X-Robots-Tag'), 'noindex, nofollow');
    assert.match(await res.text(), /https:\/\/cms\.example\/_emdash\/admin\/login/);
  }
});
test('handoff, webhook, build assets and media are exempt, without drafts', () => {
  for (const p of ['/preview/access', '/api/stripe/webhook', '/_astro/a.js', '/_emdash/api/media/file/k.webp']) assert.deepEqual(stagingAccess(req(p), env, false), { drafts: false }, p);
  for (const p of ['/preview/accessx', '/api/stripe/webhookx', '/_emdash/api/media/files']) assert.equal(stagingAccess(req(p), env, false).status, 401, p);
});
test('missing token never grants access', () => assert.equal(stagingAccess(req('/', basic('seda', 'undefined')), { CMS_ORIGIN: env.CMS_ORIGIN }, false).status, 401));
```

In `tests/foundation-access.test.mjs`, add: `hasFoundationCredentials` is true for `seda:<secret>` (both headers) and false for no token, a wrong token, and `undefined` as the token. The existing `foundationAccess` tests must keep passing unchanged.

- [ ] **Step 2: Run them and confirm they fail**

Run: `node --test tests/staging-access.test.mjs tests/foundation-access.test.mjs`
Expected: FAIL. `stagingAccess` / `hasFoundationCredentials` are not exported.

- [ ] **Step 3: Implement** `hasFoundationCredentials` and `stagingAccess`, then update `src/middleware.ts`, `src/worker.ts` and `src/lib/preview-routing.ts` as decided above. Exemptions match exact paths or a `prefix/` prefix, never a bare string prefix. The 401 body is a short HTML page with a link to `${CMS_ORIGIN}/_emdash/admin/login`, labeled for editors. Its exact wording is the implementer's choice.

- [ ] **Step 4: Run the tests**

Run: `pnpm test && pnpm typecheck`
Expected: PASS, with no reference to `PRIVATE_SITE` or `privateSite` left in `src/` or `tests/` (`grep -rn "PRIVATE_SITE\|privateSite" src tests` prints nothing).

- [ ] **Step 5: Commit**

```bash
git add src/lib/foundation-access.ts src/lib/staging-access.ts src/middleware.ts src/worker.ts src/lib/preview-routing.ts tests/staging-access.test.mjs tests/foundation-access.test.mjs tests/preview-routing.test.mjs
git commit -m "feat: gate staging by editor session or shared Basic credential"
```

### Task 2: Staging webhook records nothing

**Files:**
- Modify: `src/lib/commerce/payments.ts` (`handleStripeEvent`, new `recordsPayments`)
- Modify: `src/pages/api/stripe/webhook.ts`
- Test: `tests/commerce-payments.test.mjs`

**Interfaces:**
- Produces: `recordsPayments(mode: SiteMode, cmsOrigin: unknown): boolean`. Returns false when `mode === 'preview'` or `cmsOrigin` is a non-empty string; true otherwise (`dev` and `public`).
- Changes: `handleStripeEvent(db: Kysely<Database> | null, event, { flagPaymentIntent })`. With `db === null` it runs the same filtering and the address flag, issues no SQL, and returns `"processed"` for a handled event (`"ignored"` stays the same).
- The webhook passes `recordsPayments(siteMode(import.meta.env.DEV, import.meta.env.SITE_MODE), env.CMS_ORIGIN) ? await getDb() : null`. In that case it never calls `getDb()`.

- [ ] **Step 1: Write the failing tests** in `tests/commerce-payments.test.mjs`:

```js
test('without a database the event is verified and flagged in Stripe but nothing is recorded', async () => {
  const flags = [];
  const mismatch = session({ collected_information: { shipping_details: { address: { country: 'ES', postal_code: '28001' } } } });
  assert.equal(await handleStripeEvent(null, event('evt_9', 'checkout.session.completed', mismatch), { flagPaymentIntent: async (...a) => { flags.push(a); } }), 'processed');
  assert.deepEqual(flags, [['pi_1', 'canarias', '28001']]);
  assert.equal(await handleStripeEvent(null, event('evt_10', 'charge.refunded', { id: 'ch' }), { flagPaymentIntent: async () => {} }), 'ignored');
});
test('only non-preview builds without a CMS origin record payments', () => {
  assert.equal(recordsPayments('public', undefined), true);
  assert.equal(recordsPayments('dev', undefined), true);
  assert.equal(recordsPayments('preview', undefined), false);
  assert.equal(recordsPayments('public', 'https://cms.example'), false);
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `node --test tests/commerce-payments.test.mjs`
Expected: FAIL (`recordsPayments` is not exported; `null` db throws).

- [ ] **Step 3: Implement** the two changes and the webhook wiring. Update the header comment in `webhook.ts`: staging verifies events and flags addresses but records nothing.

- [ ] **Step 4: Run the tests**

Run: `pnpm test && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/commerce/payments.ts src/pages/api/stripe/webhook.ts tests/commerce-payments.test.mjs
git commit -m "feat: staging webhook never touches payment events"
```

### Task 3: Shared bindings in config, validation and the staging deploy

**Files:**
- Modify: `wrangler.jsonc` (values in Global Constraints; remove staging `send_email`, `PRIVATE_SITE`)
- Modify: `scripts/deploy/target.mjs` (`validateTarget`, `validateLive`, `deploymentCommands`)
- Modify: `scripts/deploy/run.mjs` (handle `catalog-model-check`)
- Test: `tests/deployment.test.mjs`

**Interfaces:**
- `validateTarget(config, 'staging')` returns `{ ..., rendering: 'live', shared: true }` and throws unless all of these hold:
  - staging's DB `database_id`, MEDIA `bucket_name` and SESSION KV `id` equal production's;
  - `CMS_ORIGIN` equals production's `EMDASH_SITE_URL` origin;
  - `FOUNDATION_LOCKED === 'true'`;
  - `triggers.crons` is empty or absent.

  Origins and Worker names must still differ.
- The distinct-database check is removed. Production validation is unchanged.
- `deploymentCommands(liveTarget)` returns exactly:
  `[statusCommand(target), ['catalog-model-check'], ['astro-preview', 'staging'], [...migration, '--check'], ['wrangler', 'deploy', '-c', 'dist-preview/server/wrangler.json']]`. There is no migrate and no `catalog-model` step, and `--check` runs before the upload.
- `run.mjs`: `catalog-model-check` calls `remoteCatalogModel(target, { check: true })` and logs `Catalog model: all versions present.`. Its existing throw stops the deploy.

- [ ] **Step 1: Write the failing tests** in `tests/deployment.test.mjs`. Replace `rejects shared staging and production databases or buckets`, `a live environment builds and uploads only the server-rendered variant`, and the staging assertions of `the checked-in config …`. Make `liveStaging()` produce a shared-binding staging. New assertions:

```js
test('staging must share production database, bucket and session store, and point CMS_ORIGIN at production', () => {
  assert.equal(validateTarget(liveStaging(), 'staging').shared, true);
  for (const mutate of [c => c.env.staging.d1_databases[0].database_id = UUID_OTHER, c => c.env.staging.r2_buckets[0].bucket_name = 'other', c => c.env.staging.kv_namespaces[0].id = 'other', c => c.env.staging.vars.CMS_ORIGIN = 'https://wrong.example', c => c.env.staging.vars.FOUNDATION_LOCKED = 'false', c => c.env.staging.triggers = { crons: ['0 * * * *'] }]) {
    const c = liveStaging(); mutate(c); assert.throws(() => validateTarget(c, 'staging'));
  }
});
test('staging deploy is read-only on the shared database and checks before uploading', () => {
  const commands = deploymentCommands(validateTarget(liveStaging(), 'staging'));
  assert.deepEqual(commands.map(x => x[0]), ['emdash', 'catalog-model-check', 'astro-preview', 'emdash', 'wrangler']);
  assert.ok(commands[0].includes('--status') && commands[3].includes('--check'));
  assert.equal(commands.some(c => c[0] === 'catalog-model'), false);
});
```

In `the checked-in config …`:
- staging: `rendering === 'live'`, `shared === true`, `vars.FOUNDATION_LOCKED === 'true'`, `assets.run_worker_first === true`, `vars.PRIVATE_SITE === undefined`, `send_email === undefined`;
- production: `triggers.crons` deep-equals `['0 * * * *']`.

- [ ] **Step 2: Run them and confirm they fail**

Run: `node --test tests/deployment.test.mjs`
Expected: FAIL on the new tests.

- [ ] **Step 3: Implement** the config, validation, command list and runner step. Update the doc comments in `target.mjs` that describe the old live flow.

- [ ] **Step 4: Run the tests**

Run: `pnpm test && pnpm typecheck && pnpm build`
Expected: all pass. `pnpm build` is the local public build. Also run `SITE_MODE=preview CLOUDFLARE_ENV=staging pnpm exec astro build` and check that it succeeds and that `dist-preview/server/wrangler.json` shows production's D1 ID, the SESSION KV and no crons.

- [ ] **Step 5: Commit**

```bash
git add wrangler.jsonc scripts/deploy/target.mjs scripts/deploy/run.mjs tests/deployment.test.mjs
git commit -m "feat: staging reads production bindings and deploys read-only"
```

### Task 4: CI order: production, then staging

**Files:**
- Modify: `.github/workflows/deploy.yml`
- Test: `tests/deploy-workflow.test.mjs`

Decisions:
- `production` has `needs: [verify]`. On a push it runs when verify succeeded; on a dispatch it runs for `inputs.environment == 'production'`. It is still gated by `PRODUCTION_DEPLOY_ENABLED`.
- `staging` has `needs: [verify, production]`. On a push it runs only when `needs.production.result == 'success'`; on a dispatch it runs for `inputs.environment == 'staging'`, which needs no production result. It is still gated by `STAGING_DEPLOY_ENABLED`.
- Both jobs use the job concurrency `group: deploy-production-db`, `cancel-in-progress: false`.
- Drop the staging media cache step, since staging no longer builds derivatives.
- Update the file's header comment.

- [ ] **Step 1: Update the tests:**
  - `production runs only when enabled, and after staging on pushes` becomes `staging runs after a successful production deploy on pushes`. It asserts that `job('staging')` matches `/needs: \[verify, production\]/` and `/needs\.production\.result == 'success'/`, that it does not match `needs.production.result == 'cancelled'`, and that `job('production')` matches `/needs: \[verify\]/`.
  - `deploys queue per environment …`: assert that both jobs match `/group: deploy-production-db/`.

- [ ] **Step 2: Run** `node --test tests/deploy-workflow.test.mjs`. Expected: FAIL.

- [ ] **Step 3: Edit the workflow** as decided.

- [ ] **Step 4: Run** `pnpm test`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/deploy.yml tests/deploy-workflow.test.mjs
git commit -m "ci: deploy production before the shared-data staging reader"
```

### Task 5: Documentation

**Files:** `AGENTS.md`, `docs/deployment.md`, `docs/checkout.md`, `README.md`

- [ ] **Step 1: `AGENTS.md` (Runtime section):**
  - Replace “Staging and production must have distinct databases, buckets, origins, and secrets” with: staging is a private SSR draft view sharing production's D1, R2 and SESSION KV; distinct origin; Stripe test keys only; no CMS, migrations, cron or payment records.
  - Replace the `production-preview` sentence: production's single Worker serves the admin.
  - Update the Scope bullet that says no deploys until phase 7. Production and staging deploys are now authorized by the user, though each remote action still needs confirmation.
- [ ] **Step 2: `docs/deployment.md`:**
  - Rewrite the Workers table and the staging access paragraph: two ways in, exempt paths, 401.
  - Secrets per Worker: staging gets production's `EMDASH_ENCRYPTION_KEY`, `FOUNDATION_ACCESS_TOKEN` and Stripe test keys; `GITHUB_REBUILD_TOKEN` goes on the production Worker.
  - Cron ownership: production.
  - The staging deploy steps (read-only checks), CI order and shared concurrency group.
  - The `staging` GitHub environment fingerprint now equals production's.
  - Delete the stale paragraphs about staging's own D1/R2, `PRIVATE_SITE` and `production-preview`.
- [ ] **Step 3: `docs/checkout.md`:** step 5 and the setup notes. The staging webhook records nothing; the Basic gate no longer needs credentials in the webhook URL (path exempt).
- [ ] **Step 4: `README.md`:** the environment description, if present.
- [ ] **Step 5: Run and commit.** Run `grep -rn "PRIVATE_SITE\|production-preview\|distinct databases" AGENTS.md README.md docs/deployment.md docs/checkout.md` and confirm it prints nothing. Then commit:

```bash
git add AGENTS.md docs/deployment.md docs/checkout.md README.md
git commit -m "docs: staging as private SSR view of production"
```

### Task 6: Remote rollout (operator steps; ask the user before each numbered step)

Not for a subagent. The session that runs it asks the user before each step, shows the exact command, and records outcomes in `docs/deployment.md`.

- [ ] **Step 1: Inspect the old preview Worker (read-only).** Run `pnpm exec wrangler deployments list --name customseda-preview`, then list its cron triggers with `curl -s -H "Authorization: Bearer $(pnpm -s exec wrangler auth token)" https://api.cloudflare.com/client/v4/accounts/9e52d6bc1e5b9be5cd11be4c1030485a/workers/scripts/customseda-preview/schedules`. Report its bindings and crons. If the name differs, list Workers with `wrangler` and identify it with the user.
- [ ] **Step 2: Delete it** after confirmation: `pnpm exec wrangler delete --name customseda-preview`.
- [ ] **Step 3: Set the secrets** after confirmation:
  - Staging: `EMDASH_ENCRYPTION_KEY` (production's value, from `.env.cloudflare-production`) and `FOUNDATION_ACCESS_TOKEN` (the reviewer token, user's choice to rotate). Use `wrangler secret put … --env staging` for each. Confirm the staging Stripe keys are `sk_test_…`.
  - Production: `GITHUB_REBUILD_TOKEN` (`--env production`).
- [ ] **Step 4: GitHub settings:** none yet. As of 2026-10-30 no deploy is configured in GitHub, so merges to `master` only run tests. See the deferred to-do below.
- [ ] **Step 5: Deploy, after confirmation:** `pnpm deploy:production`, then `pnpm deploy:staging`.
- [ ] **Step 6: Verify:**
  - Staging:
    - anonymous `/` → 401 with Basic;
    - Basic `/` → 200 and shows a known draft;
    - “View site” from the production admin → page with drafts, without a Basic prompt;
    - `/_emdash/admin` → 307 to production;
    - a test-mode checkout of a published product completes, and the webhook returns 200 with `"processed"`;
    - `SELECT count(*) FROM customseda_payment_events` (production) is unchanged.
  - Production:
    - anonymous `/` → 200 static;
    - `/_emdash/admin/` → login;
    - the cron is listed on the `customseda` Worker.
- [ ] **Deferred to-do: GitHub deploys** (not configured on 2026-10-30; do this only once the manual rollout above is verified):
  - [ ] Environment `production`: secret `CLOUDFLARE_API_TOKEN`, variable `EMDASH_TARGET_FINGERPRINT` (from `pnpm migrate:status production`, reviewed).
  - [ ] Environment `staging`: secret `CLOUDFLARE_API_TOKEN`, variable `EMDASH_TARGET_FINGERPRINT` set to **production's** value (staging checks production's database).
  - [ ] Production Worker secret `GITHUB_REBUILD_TOKEN` (fine-grained PAT, Actions read/write on this repo only); record owner and expiry in `docs/deployment.md`.
  - [ ] Repository variables `PRODUCTION_DEPLOY_ENABLED=true`, then `STAGING_DEPLOY_ENABLED=true`.
  - [ ] Check a push to `master`: production deploys first, then staging; a CMS publish dispatches production only.
- [ ] **Step 7: Retire staging's own data** after confirmation. Export a backup with `wrangler d1 export customseda-staging --remote --output backups/customseda-staging-2026-10-30.sql` and list `customseda-staging-media` objects into `backups/`. Then `wrangler d1 delete customseda-staging` and `wrangler r2 bucket delete customseda-staging-media`; the bucket has to be emptied first, with the user's confirmation of the object count.
