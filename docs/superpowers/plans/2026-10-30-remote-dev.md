# Local execution with explicit remote data

User requested `dev:staging` and `dev:production`. Each runs Astro/workerd locally with the selected environment's remote D1/R2, local isolated session KV, check-only migrations, and no rebuild/payment credentials. The temporary ignored Wrangler configuration contains no secret values; the selected environment's existing encryption key is supplied through the child process environment.

- [x] Add explicit target selection and tests for binding selection, missing targets and inherited secret/environment isolation.
- [x] Wire the Cloudflare adapter's supported `configPath`, `remoteBindings` and `persistState` options.
- [x] Document commands, prerequisites, remote-write behavior and localhost authentication.
- [x] Verify both commands start and read `/_emdash/api/setup/status` with HTTP 200 and `needsSetup: false`; stop both test servers afterward.
- [x] Run focused tests (3 passed), project typecheck (0 errors; 2 existing hints), and `git diff --check`.

Existing issue observed during staging startup: its encryption key has a format rejected by EmDash 1.3.1. Plugin secret settings are unavailable until that existing key is reviewed; no key was regenerated or rotated for this task. No export/import or deployment was performed while checking these scripts.

Follow-up: production's core CMS is initialized, but its shop collections have not been imported. Development storefront reads now check native collection metadata and skip unregistered shop types, leaving the remote schema unchanged. Strict production/build reads and errors for registered collections whose tables are missing remain intact. Verified 14 focused tests, typecheck (0 errors), and HTTP 200 for the local production-data homepage, login page and setup status. The temporary reproduction server on port 4322 was stopped afterward.
