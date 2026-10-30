const uuid = /^(?!00000000-0000-0000-0000-000000000000$)[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

/** Fail before any remote mutation when the target is missing or ambiguous. */
export function validateTarget(config, environment) {
  if (!['staging', 'production'].includes(environment)) {
    throw new Error('Choose staging or production explicitly.');
  }
  if (!/^[a-f0-9]{32}$/i.test(config.account_id ?? '')) {
    throw new Error('Set the intended Cloudflare account_id.');
  }
  const selected = config.env?.[environment];
  const database = selected?.d1_databases?.find(x => x.binding === 'DB');
  const bucket = selected?.r2_buckets?.find(x => x.binding === 'MEDIA');
  if (!uuid.test(database?.database_id ?? '')) {
    throw new Error(`Provision the ${environment} database UUID before deploying.`);
  }
  const other = config.env?.[environment === 'staging' ? 'production' : 'staging'];
  if (typeof selected?.name !== 'string' || !selected.name.trim() || typeof other?.name !== 'string' || !other.name.trim() || selected.name.trim() === other.name.trim()) {
    throw new Error('Staging and production require distinct, nonempty Worker names.');
  }
  if (!bucket?.bucket_name) throw new Error(`Set the ${environment} media bucket.`);
  // The gate lives in the Worker; static assets bypass it unless the Worker runs first (launch switch).
  if (selected?.vars?.FOUNDATION_LOCKED === 'true' && selected?.assets?.run_worker_first !== true) {
    throw new Error('Gated environments must run the Worker before static assets.');
  }
  const origin = selected?.vars?.EMDASH_SITE_URL;
  let url;
  try { url = new URL(origin); } catch { /* The check below reports the missing origin. */ }
  if (!url || url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash || ['localhost', '127.0.0.1'].includes(url.hostname)) {
    throw new Error(`Set the ${environment} EMDASH_SITE_URL to its public HTTPS origin.`);
  }
  let otherOrigin;
  try { otherOrigin = new URL(other?.vars?.EMDASH_SITE_URL).origin; } catch { /* Report missing peer origin below. */ }
  if (!otherOrigin || url.origin === otherOrigin) {
    throw new Error('Staging and production require distinct public origins.');
  }
  const target = { environment, accountId: config.account_id, databaseId: database.database_id, origin: url.origin };
  const role = selected.vars?.SITE_ROLE;
  // Staging renders every page on request from production's data; production is static and hosts the CMS.
  const expected = environment === 'staging' ? 'preview' : 'public';
  if (role !== expected) throw new Error(`Set SITE_ROLE to "${expected}" in the ${environment} environment.`);
  if (environment === 'staging') return { ...target, rendering: 'live', shared: validateShared(selected, other, otherOrigin) };
  if (selected.vars.SSR_PREVIEW_URL !== otherOrigin) throw new Error('Set SSR_PREVIEW_URL to the staging SSR origin.');
  return { ...target, rendering: 'static', previewOrigin: otherOrigin };
}

/**
 * Staging is a private SSR reader of production: same database, bucket and session store (so the
 * CMS "View site" handoff loads production sessions), production as its CMS, gated, and no cron.
 */
function validateShared(selected, production, productionOrigin) {
  const same = (key, binding, field) => {
    const value = selected[key]?.find(x => x.binding === binding)?.[field];
    return !!value && value === production?.[key]?.find(x => x.binding === binding)?.[field];
  };
  if (!same('d1_databases', 'DB', 'database_id') || !same('r2_buckets', 'MEDIA', 'bucket_name') || !same('kv_namespaces', 'SESSION', 'id')) {
    throw new Error('Staging must use the production database, media bucket and SESSION namespace.');
  }
  if (selected.vars?.CMS_ORIGIN !== productionOrigin) throw new Error('Set staging CMS_ORIGIN to the production origin.');
  if (selected.vars?.FOUNDATION_LOCKED !== 'true') throw new Error('Staging must keep FOUNDATION_LOCKED "true": it shows drafts.');
  if (selected.triggers?.crons?.length) throw new Error('Staging must not run crons: production owns maintenance.');
  return true;
}

/**
 * Migrations first (from the Astro config, since no build exists yet), so the snapshot reads the
 * migrated schema; then snapshot, image derivatives, a migrated local database for prerendering, build,
 * a check that no page is an error response, upload, and a check against the build's manifest.
 */
const migrationCommand = target => ['emdash', 'migrate', '--account-id', target.accountId, '--d1', target.databaseId, '--wrangler-config', 'wrangler.jsonc', '--wrangler-env', target.environment];

/**
 * EmDash's migration CLI needs a bearer token. CI provides CLOUDFLARE_API_TOKEN; a manual deploy uses
 * the token of the developer's `wrangler login`, so it authenticates exactly like `wrangler deploy`.
 */
export function migrationToken(env, wranglerLoginToken) {
  const token = env.CLOUDFLARE_API_TOKEN || wranglerLoginToken();
  if (!token) throw new Error('Not authenticated with Cloudflare: run `pnpm exec wrangler login` and repeat the command.');
  return token;
}

/**
 * Environment of one spawned step. Only EmDash's migration CLI gets the token; Wrangler uses its own
 * login (or the CI token). `wrangler deploy -c` reads a config the build already flattened for its
 * environment: with CLOUDFLARE_ENV set, Wrangler looks for an env section there, finds none, and
 * deploys a new Worker named "<name>-<env>" instead of updating the real one.
 */
export function commandEnv(tool, args, env, token) {
  if (tool === 'emdash') return { ...env, CLOUDFLARE_API_TOKEN: token };
  if (tool === 'wrangler' && args[0] === 'deploy' && args.includes('-c')) {
    const { CLOUDFLARE_ENV: _flattened, ...rest } = env;
    return rest;
  }
  return env;
}

/** Read-only migration status and target fingerprint, as the deploy's first step shows it. */
export const statusCommand = target => [...migrationCommand(target), '--from-config', '--status'];

export function deploymentCommands(target, { fingerprint, allowEmpty = false } = {}) {
  const migration = migrationCommand(target);
  const migrate = [
    statusCommand(target),
    [...migration, '--from-config', ...(fingerprint ? ['--expected-target-fingerprint', fingerprint] : [])],
    ['catalog-model'],
  ];
  // Staging renders every page on request from production's database, which only production
  // migrates: it checks, read-only, that the shared schema is current before uploading.
  if (target.rendering === 'live') return [
    statusCommand(target),
    ['catalog-model-check'],
    ['astro-preview', target.environment],
    [...migration, '--check'],
    ['wrangler', 'deploy', '-c', 'dist-preview/server/wrangler.json'],
  ];
  return [
    ...migrate,
    ['snapshot', target.environment, allowEmpty],
    ['images', target.environment],
    ['prerender-db', target.environment],
    ['astro', 'build'],
    ['check-static'],
    // The build writes a Wrangler config already flattened for its environment, so no --env.
    ['wrangler', 'deploy', '-c', 'dist/server/wrangler.json'],
    [...migration, '--check'],
  ];
}
