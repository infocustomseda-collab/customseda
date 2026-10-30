# Private staging implementation plan

**Approved behavior:** Staging storefront pages require an authenticated EmDash editor. “View site” uses that same session. Anonymous visitors go to the admin login; preview tokens alone do not grant access. The user authorized this staging deployment on 2026-10-30; production and other deferred work remain untouched.

**Implementation:** Add an explicit staging-only `PRIVATE_SITE` runtime flag to the existing preview routing policy. Preserve production partner redirects and local development. Disable caching of private page responses. Login/admin and their assets remain available under existing EmDash authorization; this is storefront access control, not private media storage.

- [x] Add regression tests for anonymous, editor, token-only, login and asset requests.
- [x] Wire the policy into middleware and staging configuration; update deployment documentation.
- [x] Run tests, typecheck and staging build; deploy staging and verify anonymous redirects and reachable login.
- [ ] Confirm “View site” in a real signed-in editor browser. The isolated test browser has no editor session; editor access is covered by routing tests and EmDash's existing session resolution.

**Verification — 2026-10-30:** 241 tests passed; typecheck reported zero errors and two existing hints. `pnpm deploy:staging` completed, version `3f14e446-008c-4232-b8af-41eb2aba7662`; core migrations had no pending changes and the catalog model was already present. Chrome's isolated browser verified that `/`, `/products/marea`, `/collections/bikinis` and an invalid preview URL redirect to the working login page, with private/no-store and noindex headers. Production was not deployed.
