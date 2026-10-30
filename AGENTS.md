# Custom Seda

## Administrator workflow (current operating mode)

- The administrator is not technical. Speak Spanish in plain language and handle Git, dependencies and deployment details yourself. See `docs/administrator-workflow.md`.
- The administrator has granted permission for all Git commands. Do not request separate permission for routine Git operations; preserve the agreed review/publication workflow and never discard unrelated work.
- Start the site only with `pnpm dev:production`. Do not use local D1/R2, `pnpm dev`, local snapshots or local CMS setup/authentication bypasses for the administrator. The remote database and media are real production data; never use them for disposable write tests.
- Before a new activity, inspect the working tree, fetch `origin master`, and reconcile the checkout with current `origin/master` without discarding work. If another change is unfinished, explain it and recommend finishing it before starting an unrelated change.
- Classify code work as a new feature (`feature/…`), a correction (`fix/…`), or code-owned text/photos (`content/…`). Start a separate branch from current `origin/master`, implement, run appropriate checks, commit and create a PR. Never commit directly to `master` or force-push it.
- Content already owned by EmDash must be edited in the production CMS. Tell the administrator “Debes realizar este cambio en el CMS” and identify the collection/field. Do not duplicate CMS values in source code. Explain that saving drafts affects preview immediately and publishing updates the public site after its rebuild.
- Use the integrated Codex browser at `http://localhost:4321` for code review and annotations. Interpret annotations through `DESIGN.md`, shared components and design tokens; explain effects on other pages before making a shared change. Do not promise annotations/browser access if the host reports an error.
- Ask “¿Comenzamos un nuevo cambio?” when a genuinely new request needs clarification. When a change is concrete, checked and reviewable, ask “¿Lo implementamos en producción?” unless publication is already authorized. On authorization, push, create/update the PR and merge after required checks. Report the publication link and that the process is in progress; do not wait for the Cloudflare deployment to finish. Do not describe an in-progress deployment as successful.
- Keep credentials out of source, messages and logs. Cloudflare API tokens belong outside the checkout (this administrator uses `~/.config/customseda/cloudflare.env`, mode 600); `.env.cloudflare-production` contains the existing EmDash encryption key. Prefer the administrator's persisted Wrangler login for normal development.

## Scope and source of truth

- Follow `docs/superpowers/plans/2026-10-24-custom-seda.md` phase by phase.
- Production and staging are deployed (2026-10-30, at the user's request). Every remote action (deploy, secret, deletion) still needs the user's confirmation. GitHub Actions only runs tests until `STAGING_DEPLOY_ENABLED` / `PRODUCTION_DEPLOY_ENABLED` are set; publish-triggered rebuilds need `GITHUB_REBUILD_TOKEN` on the production Worker. Remote acceptance/performance checks, recovery rehearsals and cutover remain phase 7.
- Phase 1 is infrastructure and feasibility only. The starter's posts/pages are temporary CMS smoke-test types, not the approved shop model or visual design.
- Products use native hierarchical category taxonomy terms. Conjuntos are products with a bundle flag and multiple product components. Every product has one Material, which supplies its color and available sizes; a conjunto's components must use the conjunto's material, checked only when the conjunto is published. Made to order; no stock tracking. Stripe Dashboard manages orders.
- No Tailwind. Preserve the approved identity in later design work.
- Prefer native Astro and EmDash functionality over custom structures or implementations when it meets the requirements. When reviewing the imported Shopify model, simplify forced structures and reuse native features such as taxonomies for classification where appropriate; explain any need for a custom alternative.

## Runtime

- Use pnpm, Astro, EmDash, local D1 and R2 through the Cloudflare runtime.
- Remote core migrations run from the CLI before deployment; `migrations.runtime` stays `check`.
- Never enable sandboxed plugins or Worker Loader bindings for the Free-tier deployment.
- Top-level Wrangler bindings are local only. Production owns the only data and CMS. Staging is a private SSR draft view that shares production's D1, R2 and SESSION KV, with its own origin, Stripe test keys only, and no CMS, migrations, cron or payment records.
- EmDash live queries and admin routes run server-side. Production is one Worker: pages prerender from the build-time snapshot (`pnpm snapshot --env <env>`, `src/lib/shop/snapshot.ts`), only `/api/*`, `/checkout/*` and `/_emdash/*` (admin, API, media) run per request, and it runs the hourly cron. Staging (`SITE_ROLE=preview`, built with `SITE_MODE=preview`, `CMS_ORIGIN` = production) renders every page on request with drafts, for production editors arriving through “View site” or holders of the shared Basic credential; its `/_emdash/*` redirects to production except media. Do not prerender live database queries outside the snapshot step.
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
