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
  return { environment, accountId: config.account_id, databaseId: database.database_id, origin: url.origin };
}

/**
 * Migrations first (from the Astro config, since no build exists yet), so the snapshot reads the
 * migrated schema; then snapshot, image derivatives, build, upload and check against the build's manifest.
 */
const migrationCommand = target => ['emdash', 'migrate', '--account-id', target.accountId, '--d1', target.databaseId, '--wrangler-config', 'wrangler.jsonc', '--wrangler-env', target.environment];

/**
 * Everything else authenticates with `wrangler login` (or the CI token); EmDash's migration CLI alone
 * refuses OAuth. Returns the message to show when the token is missing, or null.
 */
export function tokenRequired(env) {
  if (env.CLOUDFLARE_API_TOKEN) return null;
  return 'emdash migrate needs CLOUDFLARE_API_TOKEN (it does not accept `wrangler login`). Run, without saving it in shell history:\n  read -rs CLOUDFLARE_API_TOKEN && export CLOUDFLARE_API_TOKEN\nthen repeat the command. CI gets it from the GitHub environment secret.';
}

/** Read-only migration status and target fingerprint, as the deploy's first step shows it. */
export const statusCommand = target => [...migrationCommand(target), '--from-config', '--status'];

export function deploymentCommands(target, { fingerprint, allowEmpty = false } = {}) {
  const migration = migrationCommand(target);
  return [
    statusCommand(target),
    [...migration, '--from-config', ...(fingerprint ? ['--expected-target-fingerprint', fingerprint] : [])],
    ['catalog-model'],
    ['snapshot', target.environment, allowEmpty],
    ['images', target.environment],
    ['astro', 'build'],
    ['wrangler', 'deploy', '--env', target.environment],
    [...migration, '--check'],
  ];
}
