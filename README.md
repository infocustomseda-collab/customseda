# Custom Seda

Astro + EmDash foundation for the Shopify migration. Work stays on `master`.

The current unstyled Posts/Pages starter is a deployment test, not the final shop. Products, Conjuntos, the imported design, Stripe, and public-page prerendering follow in later phases of the [plan](docs/superpowers/plans/2026-10-24-custom-seda.md).

## Local development

Use Node >=22.23.4 (Node 24 LTS recommended) and pnpm 11.25.0.

```sh
pnpm install --frozen-lockfile
# First checkout only: copy .dev.vars.example to .dev.vars and replace its key.
# Generate a key with: openssl rand -hex 32
pnpm dev
```

Open `http://localhost:4321/_emdash/admin`. The development-only setup bypass is `http://localhost:4321/_emdash/api/setup/dev-bypass?redirect=/_emdash/admin`. It must never work on a deployed Worker.

Development uses real workerd with locally emulated D1, R2, and the Astro session KV. Local state persists in `.wrangler/`. Do not run multiple dev servers against that directory. Astro can start in the background: `pnpm exec astro dev status`, `pnpm exec astro dev logs`, and `pnpm exec astro dev stop` manage it.

```sh
pnpm test
pnpm typecheck
pnpm build:staging
```

`typecheck` regenerates ignored binding types first. Cloudflare/Astro automatically adds the session KV binding required by EmDash; this is separate from an optional content object cache. Image transformation is temporarily passthrough; build-time optimization belongs to phase 6.

## Remote environments

| Environment | Worker | Database | Media bucket |
| --- | --- | --- | --- |
| Local | `customseda-local` | Local D1 only | Local R2 only |
| Staging | `customseda-staging` | `customseda-staging` | `customseda-staging-media` |
| Production | `customseda-production` | `customseda-production` | `customseda-production-media` |

Staging: <https://customseda-staging.customseda.workers.dev/_emdash/admin/>

The temporary HTTP Basic gate uses username `seda` and the `FOUNDATION_ACCESS_TOKEN` value in the ignored `.dev.vars.staging` file. This gate protects the initial setup wizard and is additional to EmDash's passkey login. Do not send the token in a URL or commit it. The merchant must register their own passkey. Production has resources but is not published, and `customseda.com` still points to Shopify.

See [deployment and recovery](docs/deployment.md) and [verification evidence](docs/phase-1-verification.md) before deploying. A successful deployment is not certification that all CMS workloads fit Workers Free.
