# Custom Seda

Work in this checkout on `master`, as explicitly requested by the user.

## Scope and source of truth

- Follow `docs/superpowers/plans/2026-10-24-custom-seda.md` phase by phase.
- Phase 1 is infrastructure and feasibility only. The starter's posts/pages are temporary CMS smoke-test types, not the approved shop model or visual design.
- Products and Conjuntos are separate types. Made to order; no stock tracking. Stripe Dashboard manages orders.
- No Tailwind. Preserve the approved identity in later design work.

## Runtime

- Use pnpm, Astro, EmDash, local D1 and R2 through the Cloudflare runtime.
- Remote core migrations run from the CLI before deployment; `migrations.runtime` stays `check`.
- Never enable sandboxed plugins or Worker Loader bindings for the Free-tier deployment.
- Top-level Wrangler bindings are local only. Staging and production must have distinct databases, buckets, origins, and secrets.
- EmDash live queries/admin routes run server-side. The agreed public shop will use a separate build-time snapshot to prerender content in the later publishing phase; do not prerender live database queries.
- Never copy an entire local database over production as a normal deployment.

## Commands

- `pnpm dev`: local runtime and CMS; `/_emdash/admin` opens setup/login.
- `pnpm typecheck`, `pnpm test`, `pnpm build`: local validation.
- `pnpm cf:whoami`: inspect Cloudflare authentication.
- See `README.md` and `docs/deployment.md` for explicit environment deployment and backup steps.

## Security and generated files

- `.dev.vars`, `.env*`, `.wrangler/`, `.emdash/`, backups, and generated binding declarations are ignored.
- Keep secrets in runtime Worker secret bindings; never inline them with `import.meta.env`.
- Use version-matched official EmDash docs and installed types/source to verify APIs.
- Preserve generated `src/live.config.ts` boilerplate.

## Agent documentation and performance tools

- Official project skills are installed in `.agents/skills/`; pins and setup are in `docs/agent-tools.md`. Load only the skills and reference sections needed for the current task.
- Use `astro-docs`, `emdash-docs`, and `cloudflare-docs` for focused API/documentation questions before broad source searches. Verify answers against the installed package versions when APIs differ. Keep retrieved output small; request few matches where supported and print only relevant excerpts from composed tool results.
- Repository constraints above override skill defaults, especially native-only plugins and the separate public snapshot. Never enable sandboxed plugins because a vendor skill recommends them by default.
- Use Chrome DevTools MCP for requested network/performance measurements in its isolated profile. Do not use the user's personal browser profile or send local/admin URLs to external CrUX services.
- For database changes, define the required data and expected reads before implementation. Measure complete create/save/publish requests as well as individual validators; a platform-limit ceiling is not a performance target.
