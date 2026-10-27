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
  if (!bucket?.bucket_name || database.database_id === other?.d1_databases?.find(x => x.binding === 'DB')?.database_id || bucket.bucket_name === other?.r2_buckets?.find(x => x.binding === 'MEDIA')?.bucket_name) {
    throw new Error('Staging and production require distinct databases and media buckets.');
  }
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
  if (role === 'preview') return { ...target, rendering: 'live', preview: validateLive(config, environment, selected) };
  if (role !== 'public') throw new Error(`Set SITE_ROLE to "public" or "preview" in the ${environment} environment.`);
  return { ...target, rendering: 'static', preview: validatePreview(config, environment, selected, url.origin, database, bucket) };
}

/** A live environment is one Worker rendering every page on request: no static partner to send visitors to. */
function validateLive(config, environment, selected) {
  if (config.env?.[`${environment}-preview`]) {
    throw new Error(`A live ${environment} environment has no ${environment}-preview partner; remove it or set SITE_ROLE to "public".`);
  }
  if (selected.vars?.PUBLIC_SITE_URL || selected.vars?.PREVIEW_SITE_URL) {
    throw new Error(`A live ${environment} environment serves everyone itself; remove PUBLIC_SITE_URL and PREVIEW_SITE_URL.`);
  }
  return undefined;
}

/** The preview Worker shares its pair's database and bucket; only its role, name and origin differ. */
function validatePreview(config, environment, selected, publicOrigin, database, bucket) {
  const previewEnvironment = `${environment}-preview`;
  const preview = config.env?.[previewEnvironment];
  if (!preview) throw new Error(`The ${previewEnvironment} environment is missing from the Wrangler config.`);
  const expectedName = `${selected.name.trim()}-preview`;
  if (preview.name !== expectedName) throw new Error(`The ${previewEnvironment} Worker name must be ${expectedName}.`);
  if (preview.d1_databases?.find(x => x.binding === 'DB')?.database_id !== database.database_id) {
    throw new Error(`The ${previewEnvironment} environment must use the same database_id as ${environment}.`);
  }
  if (preview.r2_buckets?.find(x => x.binding === 'MEDIA')?.bucket_name !== bucket.bucket_name) {
    throw new Error(`The ${previewEnvironment} environment must use the same media bucket as ${environment}.`);
  }
  if (preview.vars?.SITE_ROLE !== 'preview') throw new Error(`Set SITE_ROLE to "preview" in the ${previewEnvironment} environment.`);
  let previewUrl;
  try { previewUrl = new URL(preview.vars?.EMDASH_SITE_URL); } catch { /* The check below reports the missing origin. */ }
  if (!previewUrl || previewUrl.protocol !== 'https:' || previewUrl.username || previewUrl.password || previewUrl.pathname !== '/' || previewUrl.search || previewUrl.hash || ['localhost', '127.0.0.1'].includes(previewUrl.hostname)) {
    throw new Error(`Set the ${previewEnvironment} EMDASH_SITE_URL to its public HTTPS origin.`);
  }
  for (const [name, other] of Object.entries(config.env ?? {})) {
    if (name === previewEnvironment) continue;
    let otherOrigin;
    try { otherOrigin = new URL(other?.vars?.EMDASH_SITE_URL).origin; } catch { /* Not an origin to compare. */ }
    if (otherOrigin === previewUrl.origin) throw new Error(`The ${previewEnvironment} preview origin must differ from the ${name} origin.`);
  }
  if (selected.vars?.PREVIEW_SITE_URL !== previewUrl.origin) {
    throw new Error(`Set PREVIEW_SITE_URL in ${environment} to the ${previewEnvironment} origin.`);
  }
  if (preview.vars?.PUBLIC_SITE_URL !== publicOrigin) {
    throw new Error(`Set PUBLIC_SITE_URL in ${previewEnvironment} to the ${environment} origin.`);
  }
  if (preview.vars?.FOUNDATION_LOCKED === 'true' && preview.assets?.run_worker_first !== true) {
    throw new Error('Gated preview environments must run the Worker before static assets.');
  }
  return { environment: previewEnvironment, origin: previewUrl.origin };
}

/**
 * Migrations first (from the Astro config, since no build exists yet), so the snapshot reads the
 * migrated schema; then snapshot, image derivatives, a migrated local database for prerendering, build,
 * a check that no page is an error response, upload, then the server-rendered preview build and its
 * upload, and a check against the build's manifest (both builds share one commit and config).
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
  // A live environment renders every page on request: no snapshot, derivatives or prerendering.
  if (target.rendering === 'live') return [
    ...migrate,
    ['astro-preview', target.environment],
    ['wrangler', 'deploy', '-c', 'dist-preview/server/wrangler.json'],
    [...migration, '--check'],
  ];
  return [
    ...migrate,
    ['snapshot', target.environment, allowEmpty],
    ['images', target.environment],
    ['prerender-db', target.environment],
    ['astro', 'build'],
    ['check-static'],
    // Build the preview variant before any upload, so a failed build stops the deploy early.
    ['astro-preview', target.preview.environment],
    // Each build writes a Wrangler config already flattened for its environment, so no --env.
    ['wrangler', 'deploy', '-c', 'dist/server/wrangler.json'],
    ['wrangler', 'deploy', '-c', 'dist-preview/server/wrangler.json'],
    [...migration, '--check'],
  ];
}
