# Two-Worker publishing and private preview

## Requested behavior

- `https://customseda.customseda.workers.dev`: public SSG storefront; sole EmDash CMS host at `/_emdash/admin/`. Checkout, webhooks, CMS APIs and original media remain server-side.
- `https://customseda-staging.customseda.workers.dev`: private SSR storefront reading the same production D1 and R2 as production. No separately accessible CMS or login here.
- Production CMS “View site” opens the staging SSR storefront with authenticated preview access. The production storefront updates after publication and a successful static rebuild.
- Remove the `production-preview` role from local configuration and deployment orchestration after the replacement is verified. Retire its remote Worker only after the two replacement Workers work.

## Authentication

Cookies on the two workers.dev hostnames cannot be shared directly. Use a short-lived, single-use handoff issued only to a signed-in production editor, validated on staging against the shared database, to establish preview access. Keep credentials out of the “View site” URL. Do not treat a Referer header as authentication. Staging visitors without preview access return to production's CMS login. Keep private responses uncached and excluded from indexing. Verify logout/session expiry behavior explicitly.

EmDash 1.3.1's native `/api/auth/handover` flow targets the chosen site origin and Security settings; it is not directly configurable as this preview handoff. Prefer supported EmDash extension points; do not edit installed package files. Inspect the admin's supported link configuration before choosing the integration.

## Data transition requiring a choice

Read-only remote checks on 2026-10-30 found staging has one CMS user and product tables; production has zero users and no product table. The databases currently have distinct IDs and distinct R2 buckets.

1. Transfer the current staging catalog/media through supported EmDash export/import to the existing production D1/R2, then register production-host credentials. Preserve the staging source until verification. This follows the requested production bindings and keeps resource names accurate.
2. Adopt the current staging D1/R2 as the shared production resources, explicitly documenting their historical names, and arrange the production-host login handover. This preserves existing records without a content transfer but changes which resources are designated production.

Do not silently change database targets or overwrite a database. No remote mutations have been performed for this architecture change.

## Implementation and verification

Update Worker configuration, public/admin routing, private preview authentication, “View site”, cron/rebuild ownership, deployment validation/orchestration, tests, and project documentation together. Production owns CMS maintenance and publication-triggered rebuilds; staging is the SSR reader. Generate production's static snapshot from published shared data only. Preview tokens must not grant unscoped draft access.

Test anonymous access, handoff replay/expiry/tampering, editor access across both hosts, absence of staging CMS access, draft visibility, publish/rebuild, static public delivery, checkout/media routes and environment targeting. Run project tests/typecheck and both builds, then verify deployed behavior before retiring the old preview Worker.
