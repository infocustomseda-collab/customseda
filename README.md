# Custom Seda

Astro + EmDash shop with Stripe Checkout on Cloudflare.

The public Posts/Pages starter remains a deployment test. The local CMS now has Products (including bundle products), native category taxonomies, lookup records, and supporting content. The imported design, Stripe, and public-page prerendering follow in later phases of the [plan](docs/superpowers/plans/2026-10-24-custom-seda.md). See the [catalog model and editor workflow](docs/catalog-model.md). Product pages buy one item at a time through Stripe Checkout; see [checkout and Stripe operations](docs/checkout.md). Public pages are prerendered from a snapshot of published content, and GitHub Actions deploys `master`; see [deployment](docs/deployment.md).

## Local development

**Administrator workstation:** follow [the administrator workflow](docs/administrator-workflow.md). This machine uses `pnpm dev:production` exclusively, connected to production D1/R2. The local-only examples below describe developer infrastructure and are not the administrator's workflow.

The project pins Node 24.21.0 and pnpm 11.25.0 in `.tool-versions`, matching the package manager declared in `package.json`.

```sh
mise install
pnpm install --frozen-lockfile
# First checkout only: copy .env.example to .env and replace its key.
# Generate a key with: openssl rand -hex 32
pnpm dev
```

Open `http://localhost:4321/_emdash/admin`. The development-only setup bypass is `http://localhost:4321/_emdash/api/setup/dev-bypass?redirect=/_emdash/admin`. It must never work on a deployed Worker.

To run the app locally against remote data, stop the other dev server and choose explicitly:

```sh
pnpm dev:staging
pnpm dev:production
```

These commands execute the app in local workerd at `http://localhost:4321`, with remote D1/R2 bindings selected from that environment in `wrangler.jsonc`. Staging's bindings are production's, so both commands read and write the same database and bucket. The startup banner prints the database and bucket. You need `wrangler login` and the selected Worker's `EMDASH_ENCRYPTION_KEY` in the ignored `.env.cloudflare-staging` or `.env.cloudflare-production` (the same key on both). Only that key is supplied to the local runtime; live payment and rebuild secrets are not loaded. Sessions are local and isolated per target, automatic migrations are check-only, and no deployment is performed. Existing remote-host passkeys do not work on localhost. The development auth bypass may create a developer administrator in the remote database if used; it is not invoked automatically. Editing, importing, deleting, or publishing through this local CMS changes the selected remote data. Export processing runs locally; D1/R2 operations still use Cloudflare. Open `/_emdash/admin/settings/transfer` to export the selected remote site. Remote dev does not prepare image derivatives; original media remains available from R2.

With the dev server running, use a second terminal:

```sh
pnpm cms:model
```

This applies the versioned catalog model to local D1 and regenerates CMS types. Repeat safely after setup; it preserves existing content. Refresh the admin panel to see the new types.

The local Spanish catalog contains 16 Products, including 5 bundles. Media stays editable in EmDash/local R2. Byte-identical original photographs are also kept in [`assets/originals/`](assets/originals/README.md), separated into product and site folders with a SHA-256 manifest. Run `pnpm media:originals` to refresh that local archive. The completed importer and its source inventories have been retired; `pnpm cms:model` removes the obsolete fields and metadata from an existing local database. See [content maintenance](docs/content-maintenance.md).

`pnpm dev` prepares responsive WebP images from local draft content before starting. CMS text and settings still update live. After uploading new images, run `pnpm images:local` in the second terminal to prepare their derivatives; until then those images use their originals. The preparation reuses cached derivatives for unchanged photos.

For Lighthouse, use a local production build so development scripts and live CMS queries do not distort the result:

```sh
# Stop pnpm dev first; both servers use the same local runtime state.
pnpm build:local-preview
pnpm preview
```

This preview includes drafts, stays local, and needs rebuilding after edits. `pnpm build` continues to include published content only. Test the URL printed by the preview server in Chrome with the same Lighthouse device/settings for each run.

Development uses real workerd with locally emulated D1, R2, and the Astro session KV. Local state persists in `.wrangler/`. Do not run multiple dev servers against that directory. Astro can start in the background: `pnpm exec astro dev status`, `pnpm exec astro dev logs`, and `pnpm exec astro dev stop` manage it.

```sh
pnpm test
pnpm typecheck
pnpm build
```

`typecheck` regenerates ignored binding types first. Cloudflare/Astro automatically adds the session KV binding required by EmDash; this is separate from an optional content object cache. Runtime image transformation stays passthrough; the image preparation step generates static WebP derivatives.

## Remote environments

| Environment | Worker | Database | Media bucket |
| --- | --- | --- | --- |
| Local | `customseda-local` | Local D1 only | Local R2 only |
| Production | `customseda` (static storefront and the CMS) | `customseda-production` | `customseda-production-media` |
| Staging | `customseda-staging` (private, renders on request) | production's | production's |

Production: <https://customseda.customseda.workers.dev/> is the public static storefront, and <https://customseda.customseda.workers.dev/_emdash/admin/> is the only CMS (passkey login).

Staging: <https://customseda-staging.customseda.workers.dev/> renders production's content on request, drafts included, for review before publishing. It has no admin and no data of its own. Two ways in: “View site” in the production CMS, or HTTP Basic with username `seda` and the `FOUNDATION_ACCESS_TOKEN` value from the ignored `.env.cloudflare-staging` file. Staging checkout uses Stripe test mode and records nothing. See [deployment](docs/deployment.md#workers-per-environment).

CLI clients that need `Authorization` for an EmDash API token send the Basic credentials in an `X-Foundation-Access` header instead. Do not send the token in a URL or commit it. `customseda.com` still points to Shopify.

The production deployment runner migrates EmDash core and then the versioned catalog model from the CLI before uploading the Worker. Staging deploys never migrate: they check that production's database is current. See [catalog migration boundaries](docs/catalog-model.md#deployment-boundary). `pnpm test:d1` rehearses the catalog migration against isolated local D1; actual remote catalog acceptance remains pending.

See [deployment and recovery](docs/deployment.md) and [verification evidence](docs/phase-1-verification.md) before deploying. A successful deployment is not certification that all CMS workloads fit Workers Free.

## Agent tooling

Official EmDash and Cloudflare skills are pinned under `.agents/skills/`. Documentation MCPs and an isolated Chrome performance MCP are configured on this Codex host. See [setup, versions and verification](docs/agent-tools.md).
