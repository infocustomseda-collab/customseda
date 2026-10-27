# Content after the completed import

The shop uses native EmDash content and media. The retired source importer, endpoint, inventory, reports and source ID fields are no longer needed; earlier tracked versions remain in Git history. Public product, collection, blog, page and policy paths remain unchanged.

## Model cleanup

`pnpm cms:model`, with the local development server running, applies `customseda.catalog-cleanup.v1`. This removes `shopify_id` and `shopify_source` through EmDash's schema registry, scrubs those keys from revision snapshots, deletes the obsolete import options, and renames the Site Settings entry to `home` without changing its ID. The same versioned migration is available to deployment tooling, but no remote migration was run for this cleanup.

Create a consistent local D1 backup before applying this removal to another existing database. Field deletion removes stored source values. The cleanup leaves editorial content, references, galleries, prices and publication states intact. Incomplete native drafts remain possible; catalog write and publication validation still enforce supported sizes.

The local pre-cleanup backup is ignored under `backups/before-retire-import-*.sqlite`. Old recovery backups are intentionally retained outside the working source tree.

## Original media

See [`assets/originals/`](../assets/originals/README.md). The archive contains the original files and a SHA-256 manifest, separated into product and site images. EmDash continues to manage editable media in R2. Build derivatives remain generated files.

## Privacy policy

[`privacy-policy.md`](privacy-policy.md) records the revised Spanish copy applied to the local `privacy-policy` CMS page. Further editorial changes belong in EmDash; keep this reference document aligned when changing the approved policy. The page remains a local draft and retains its existing public URL. The obsolete initial template was replaced in the base row as well as the current draft; one unreferenced revision of that template was removed after the new draft was saved. The pre-cleanup backup retains the old policy for recovery.

The policy describes the implemented buy-now flow: Stripe Checkout collects customer/payment and delivery information, Stripe Dashboard manages orders, and local payment-event rows contain identifiers/statuses. It also describes the popup dismissal stored in the browser and the absence of advertising/analytics integrations in the current implementation. Astro and EmDash are software used by the site, not separate hosted services receiving visitor data merely because those tools are installed.

The user confirmed retaining the existing controller/contact details: Seda, Calle Benecharo, 35009, Las Palmas, España; info.customseda@gmail.com. No fuller legal identity or address has been invented. Recheck the policy if actual services, data handling, provider configuration or business details change before launch.

Sources consulted on 2026-10-27: [AEPD information duties](https://www.aepd.es/derechos-y-deberes/conoce-tus-derechos/derecho-de-informacion), [Cloudflare privacy](https://www.cloudflare.com/privacypolicy/) and [Stripe privacy](https://stripe.com/privacy).

## Staging and launch

This cleanup is local only. Phase 7 must define and verify transfer of the approved EmDash content and original media to staging. Do not restore the obsolete source importer or copy the entire local database to production.
