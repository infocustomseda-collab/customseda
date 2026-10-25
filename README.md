# Custom Seda

Astro + EmDash foundation for the Shopify migration. Work stays on `master`.

The public Posts/Pages starter remains a deployment test. The local CMS now has Products, separate Conjuntos, lookup records, and supporting content. The imported design, Stripe, and public-page prerendering follow in later phases of the [plan](docs/superpowers/plans/2026-10-24-custom-seda.md). See the [catalog model and editor workflow](docs/catalog-model.md). Product pages buy one item at a time through Stripe Checkout; see [checkout and Stripe operations](docs/checkout.md). Public pages are prerendered from a snapshot of published content, and GitHub Actions deploys `master`; see [deployment](docs/deployment.md).

## Local development

The project pins Node 24.21.0 and pnpm 11.25.0 in `.tool-versions`, matching the package manager declared in `package.json`.

```sh
mise install
pnpm install --frozen-lockfile
# First checkout only: copy .env.example to .env and replace its key.
# Generate a key with: openssl rand -hex 32
pnpm dev
```

Open `http://localhost:4321/_emdash/admin`. The development-only setup bypass is `http://localhost:4321/_emdash/api/setup/dev-bypass?redirect=/_emdash/admin`. It must never work on a deployed Worker.

With the dev server running, use a second terminal:

```sh
pnpm cms:model
```

This applies the versioned catalog model to local D1 and regenerates CMS types. Repeat safely after setup; it preserves existing content. Refresh the admin panel to see the new types.

The current public Shopify catalog is imported locally as Spanish drafts, with original media in local R2. Run `pnpm import:shopify --dry-run`, `pnpm import:shopify --apply`, or `pnpm import:shopify:verify` in the second terminal. See the [import workflow and verified results](docs/import/shopify-local-import.md); retries preserve existing editorial entries.

Development uses real workerd with locally emulated D1, R2, and the Astro session KV. Local state persists in `.wrangler/`. Do not run multiple dev servers against that directory. Astro can start in the background: `pnpm exec astro dev status`, `pnpm exec astro dev logs`, and `pnpm exec astro dev stop` manage it.

```sh
pnpm test
pnpm typecheck
pnpm build
```

`typecheck` regenerates ignored binding types first. Cloudflare/Astro automatically adds the session KV binding required by EmDash; this is separate from an optional content object cache. Image transformation is temporarily passthrough; build-time optimization belongs to phase 6.

## Remote environments

| Environment | Worker | Database | Media bucket |
| --- | --- | --- | --- |
| Local | `customseda-local` | Local D1 only | Local R2 only |
| Staging | `customseda-staging` | `customseda-staging` | `customseda-staging-media` |
| Production | `customseda-production` | `customseda-production` | `customseda-production-media` |

Staging: <https://customseda-staging.customseda.workers.dev/_emdash/admin/>

The temporary HTTP Basic gate uses username `seda` and the `FOUNDATION_ACCESS_TOKEN` value in the ignored `.env.cloudflare-staging` file. This gate protects the initial setup wizard and is additional to EmDash's passkey login. Do not send the token in a URL or commit it. The merchant must register their own passkey. Production has resources but is not published, and `customseda.com` still points to Shopify.

The deployment runner migrates EmDash core and then the versioned catalog model from the CLI before uploading the Worker. See [catalog migration boundaries](docs/catalog-model.md#deployment-boundary). `pnpm test:d1` rehearses the catalog migration against isolated local D1; actual remote catalog acceptance remains pending.

See [deployment and recovery](docs/deployment.md) and [verification evidence](docs/phase-1-verification.md) before deploying. A successful deployment is not certification that all CMS workloads fit Workers Free.

## Agent tooling

Official EmDash and Cloudflare skills are pinned under `.agents/skills/`. Documentation MCPs and an isolated Chrome performance MCP are configured on this Codex host. See [setup, versions and verification](docs/agent-tools.md).
