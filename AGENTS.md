# Custom Seda

## Scope and source of truth

- Follow `docs/superpowers/plans/2026-10-24-custom-seda.md` phase by phase.
- Work locally (confirmed by the user again on 2026-10-25, after phase 6). No staging or production deploys until phase 7. The deploy tooling exists but stays off: GitHub Actions only runs tests until `STAGING_DEPLOY_ENABLED` / `PRODUCTION_DEPLOY_ENABLED` are set, publish-triggered rebuilds need `GITHUB_REBUILD_TOKEN`, and manual `pnpm deploy:<env>` (wrangler login) is for phase 7. The staging catalog import, remote acceptance/performance checks, recovery rehearsals and cutover are phase 7.
- Phase 1 is infrastructure and feasibility only. The starter's posts/pages are temporary CMS smoke-test types, not the approved shop model or visual design.
- Products use native hierarchical category taxonomy terms. Conjuntos are products with a bundle flag and multiple product components. Every product has one Material, which supplies its color and available sizes; a conjunto's components must use the conjunto's material, checked only when the conjunto is published. Made to order; no stock tracking. Stripe Dashboard manages orders.
- No Tailwind. Preserve the approved identity in later design work.
- Prefer native Astro and EmDash functionality over custom structures or implementations when it meets the requirements. When reviewing the imported Shopify model, simplify forced structures and reuse native features such as taxonomies for classification where appropriate; explain any need for a custom alternative.

## Runtime

- Use pnpm, Astro, EmDash, local D1 and R2 through the Cloudflare runtime.
- Remote core migrations run from the CLI before deployment; `migrations.runtime` stays `check`.
- Never enable sandboxed plugins or Worker Loader bindings for the Free-tier deployment.
- Top-level Wrangler bindings are local only. Staging and production must have distinct databases, buckets, origins, and secrets.
- EmDash live queries and admin routes run server-side. Public pages prerender from the build-time snapshot (`pnpm snapshot --env <env>`, `src/lib/shop/snapshot.ts`); only `/_emdash/*`, `/api/*` and `/checkout/*` run per request. Do not prerender live database queries outside the snapshot step.
- Never copy an entire local database over production as a normal deployment.

## Commands

- `pnpm dev`: local runtime and CMS; `/_emdash/admin` opens setup/login.
- `pnpm typecheck`, `pnpm test`, `pnpm build`: local validation. `pnpm build` snapshots local published content; preview the draft catalog with `pnpm snapshot --env local --drafts && node scripts/build/images.mjs --env local && pnpm exec astro build`.
- `pnpm cf:whoami`: inspect Cloudflare authentication.
- See `README.md` and `docs/deployment.md` for explicit environment deployment and backup steps.

## Security and generated files

- Secret files follow the fdag layout and are ignored: `.env` (local Worker secrets), `.env.cloudflare-<env>` (remote Worker secrets). Deploys authenticate with `wrangler login` (the runner passes its token to `emdash migrate`); CI uses `CLOUDFLARE_API_TOKEN`. Never put a Cloudflare API token in a file in the repo folder. Never create `.env.production`/`.env.development`/`.env.local`/`.env.staging`. `.wrangler/`, `.emdash/`, backups, and generated binding declarations are ignored too.
- Keep secrets in runtime Worker secret bindings; never inline them with `import.meta.env`.
- Use version-matched official EmDash docs and installed types/source to verify APIs.
- Preserve generated `src/live.config.ts` boilerplate.

## Agent documentation and performance tools

- Official project skills are installed in `.agents/skills/`; pins and setup are in `docs/agent-tools.md`. Load only the skills and reference sections needed for the current task.
- Use `astro-docs`, `emdash-docs`, and `cloudflare-docs` for focused API/documentation questions before broad source searches. Verify answers against the installed package versions when APIs differ. Keep retrieved output small; request few matches where supported and print only relevant excerpts from composed tool results.
- Repository constraints above override skill defaults, especially native-only plugins and the separate public snapshot. Never enable sandboxed plugins because a vendor skill recommends them by default.
- Use Chrome DevTools MCP for requested network/performance measurements in its isolated profile. Do not use the user's personal browser profile or send local/admin URLs to external CrUX services.
- For database changes, define the required data and expected reads before implementation. Measure complete create/save/publish requests as well as individual validators; a platform-limit ceiling is not a performance target.
