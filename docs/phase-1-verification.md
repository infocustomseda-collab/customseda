# Phase 1 verification — 2026-10-24

## Status

**Schedule update — 2026-10-25:** The user deferred all remaining staging work to phase 7 and chose local development for now. The observations below remain historical evidence; the outstanding remote checks are launch requirements and no longer block local phases 3–6.

Foundation implemented and staging deployed. **Phase 1 is not yet fully accepted:** the merchant must register a staging passkey, and authenticated remote editing/upload tests must follow. No production Worker or Shopify domain cutover has occurred.

## Versions

- Official `create-emdash` 1.3.1 Cloudflare Starter, sandboxed plugins disabled.
- Astro 7.4.2, EmDash and Cloudflare package 1.3.1.
- Astro Cloudflare adapter 14.4.2, React integration 7.1.1, React 19.2.4.
- Wrangler 4.152.0, pnpm 11.25.0, TypeScript 5.9.3.
- Exact direct dependency versions and a committed-ready lockfile; the starter's dependency build allowlist/release-age safeguards are retained.

## Remote resources

Account: Custom Seda (`9e52d6bc1e5b9be5cd11be4c1030485a`).

| Resource | Staging | Production |
| --- | --- | --- |
| D1 | `8c279b51-3653-400f-a02c-408acb52569f` | `ef91b5bb-deb3-4984-93ee-83b2df4e5083` |
| R2 | `customseda-staging-media` | `customseda-production-media` |
| Worker | `customseda-staging` deployed | Not deployed |
| Astro session KV | `3dd0de7a4adc4bb688350848e5cdf8cd` | Not yet provisioned |

Staging URL: <https://customseda-staging.customseda.workers.dev>.

Both D1 databases had all **90 core migrations applied through the CLI**, with zero pending migrations afterwards. No remote core migration was delegated to an HTTP request. Staging's first request applied the small content schema seed as expected; this is distinct from core migrations.

## Checks observed

- Fresh review found shared-artifact concurrency and missing Worker/origin separation checks; both were reproduced with failing tests and fixed before final verification.
- Unit tests: 11 pass, covering target selection, missing IDs, origin validation, staging/production isolation, migration-before-deployment ordering, deployment serialization/retry, and the temporary access gate.
- Astro type checks: zero errors, warnings, or hints at the last recorded run.
- Staging build: success. The upstream admin client still emits Vite's large-chunk advisory.
- Wrangler upload dry run: success; approximately 19.2 MiB uncompressed / 4.9 MiB gzip, without a Worker Loader binding.
- First staging deployment: success, startup 27 ms, isolated D1/R2/session KV bindings. Final clean redeployment succeeded with 23 ms startup and retained the same resources.
- Anonymous setup request: 401 from the temporary gate.
- Authorized setup status: 200, `needsSetup: true`, passkey mode.
- Authorized admin route: redirects to the setup wizard as intended.
- Repeated setup-status requests: 12/12 returned 200. Traced warm requests used approximately 4–9 ms CPU, with one colder request at 42 ms. Earlier first-request seed/setup traces used 177 ms and 49 ms; occasional headroom must not be mistaken for a reliable 10 ms ceiling.
- An attempted explicit `cpu_ms: 10` deployment was rejected with Cloudflare error **100328: CPU limits are not supported for the Free plan**. This confirms the account is Workers Free and that custom CPU ceilings cannot be used there. The unsupported setting was removed; the failed upload did not replace the working deployment. No paid plan was enabled.
- Local development-only setup, content creation, publication, public rendering, and persistence after a process restart passed.
- A 67-byte fixture uploaded directly to staging R2 was served byte-for-byte by the staging Worker (200); remote EmDash-admin upload is still pending.
- Local R2 upload/confirmation and reading the confirmed image after restart passed. EmDash changes the reserved upload storage key; consumers must use the confirmed media key/URL.
- Offsite staging SQL backup (excluding reconstructible FTS5 indexes) restored to an isolated local SQLite database: integrity check `ok`, no foreign-key violations, all 90 migration records preserved.

## Outstanding acceptance checks

- Merchant creates the real staging administrator/passkey; no simulated production credential was created.
- Verify remote login, editor save/publication, relation editing, and realistic gallery uploads through EmDash with that account.
- Measure CPU/errors for those authenticated workloads and scheduled tasks. Low setup-status CPU does not establish editor or image-processing compatibility.
- Verify remote publication persistence after another successful deployment (R2 fixture persistence already passed).
- Remote D1 restore rehearsal is approval-blocked: automatic approval review rejected rewinding staging because post-bookmark changes could be discarded. No marker table or restore was executed. A read-only offsite export/local restore was used instead.
- Full remote database + media + keys + authentication recovery remains to be tested; SQL integrity alone does not prove that complete application recovery works.

## Decisions

- Stay on `master`, honoring the user's explicit preference.
- Keep the official starter's temporary Posts/Pages instead of implementing phase 2's shop schema early.
- Keep runtime image transformations disabled until the build-time media pipeline is implemented; no Cloudflare Images usage is required by this foundation.
- Use separate ignored, owner-readable secret files for local/staging/production. Protect unclaimed setup with HTTP Basic in addition to normal CMS authentication.
- Serialize this checkout's deployment script with a checkout-wide atomic lock; future distributed CI must also queue by account/database.
- A plain D1 export was rejected because of FTS5; use the documented FTS-aware export or approved Time Travel recovery.

Raw logs, credentials, backup SQL, and HTTP capture details remain in ignored local directories. Share this summary, not raw request traces.
