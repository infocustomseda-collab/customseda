import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateTarget, deploymentCommands, commandEnv } from '../scripts/deploy/target.mjs';

test('wrangler deploys a generated config without CLOUDFLARE_ENV, so the Worker keeps its own name', () => {
  const env = { PATH: '/bin', CLOUDFLARE_ENV: 'staging', CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32) };
  // With CLOUDFLARE_ENV set, Wrangler looks for env.staging in the flattened file, finds none,
  // and deploys a new Worker named "<name>-staging".
  const deploy = commandEnv('wrangler', ['deploy', '-c', 'dist-preview/server/wrangler.json'], env, 'tok');
  assert.equal('CLOUDFLARE_ENV' in deploy, false);
  assert.equal(deploy.CLOUDFLARE_ACCOUNT_ID, env.CLOUDFLARE_ACCOUNT_ID);
  assert.equal(deploy.CLOUDFLARE_API_TOKEN, undefined);
  // EmDash's migration CLI needs the token and the selected environment.
  const migrate = commandEnv('emdash', ['migrate', '--check'], env, 'tok');
  assert.equal(migrate.CLOUDFLARE_ENV, 'staging');
  assert.equal(migrate.CLOUDFLARE_API_TOKEN, 'tok');
  // The caller's object is never changed.
  assert.equal(env.CLOUDFLARE_ENV, 'staging');
});

const origin = name => `https://customseda-${name}.example.workers.dev`;
const config = () => ({
  account_id: 'a'.repeat(32),
  env: Object.fromEntries(['staging', 'production'].flatMap((name, index) => [[name, {
    name: `customseda-${name}`,
    vars: { EMDASH_SITE_URL: origin(name), SITE_ROLE: 'public', PREVIEW_SITE_URL: origin(`${name}-preview`) },
    d1_databases: [{ binding: 'DB', database_name: `customseda-${name}`, database_id: `${index + 1}2345678-1234-1234-1234-123456789abc` }],
    r2_buckets: [{ binding: 'MEDIA', bucket_name: `customseda-${name}-media` }],
  }], [`${name}-preview`, {
    name: `customseda-${name}-preview`,
    vars: { EMDASH_SITE_URL: origin(`${name}-preview`), SITE_ROLE: 'preview', PUBLIC_SITE_URL: origin(name) },
    d1_databases: [{ binding: 'DB', database_name: `customseda-${name}`, database_id: `${index + 1}2345678-1234-1234-1234-123456789abc` }],
    r2_buckets: [{ binding: 'MEDIA', bucket_name: `customseda-${name}-media` }],
  }]])),
});

test('requires an explicit remote environment', () => {
  for (const env of [undefined, '', 'local', 'master', '--production']) {
    assert.throws(() => validateTarget(config(), env), /staging or production/);
  }
});

test('rejects missing provisioning and unsafe authentication origins', () => {
  const c = config();
  delete c.env.staging.d1_databases[0].database_id;
  assert.throws(() => validateTarget(c, 'staging'), /database UUID/);
  c.env.staging.d1_databases[0].database_id = '00000000-0000-0000-0000-000000000000';
  assert.throws(() => validateTarget(c, 'staging'), /database UUID/);
  c.env.staging.d1_databases[0].database_id = config().env.staging.d1_databases[0].database_id;
  for (const origin of ['', 'http://localhost:4321', 'https://user:password@example.com', 'https://example.com/path']) {
    c.env.staging.vars.EMDASH_SITE_URL = origin;
    assert.throws(() => validateTarget(c, 'staging'), /HTTPS origin/);
  }
});

test('rejects shared staging and production databases or buckets', () => {
  const c = config();
  c.env.staging.d1_databases[0].database_id = c.env.production.d1_databases[0].database_id;
  assert.throws(() => validateTarget(c, 'staging'), /distinct/);
  c.env.staging.d1_databases[0].database_id = config().env.staging.d1_databases[0].database_id;
  c.env.staging.r2_buckets[0].bucket_name = c.env.production.r2_buckets[0].bucket_name;
  assert.throws(() => validateTarget(c, 'staging'), /distinct/);
});

test('rejects missing or shared Worker names and normalized environment origins', () => {
  for (const name of ['', 'customseda-staging']) {
    const c = config();
    c.env.production.name = name;
    assert.throws(() => validateTarget(c, 'production'), /distinct.*Worker/);
  }
  const c = config();
  c.env.production.vars.EMDASH_SITE_URL = c.env.staging.vars.EMDASH_SITE_URL + '/';
  c.env['production-preview'].vars.PUBLIC_SITE_URL = c.env.production.vars.EMDASH_SITE_URL;
  assert.throws(() => validateTarget(c, 'production'), /distinct.*origin/);
});

test('migrates the explicit database, then snapshots, builds, uploads and checks', () => {
  const target = validateTarget(config(), 'staging');
  const commands = deploymentCommands(target);
  assert.deepEqual(commands.map(x => x[0]), ['emdash', 'emdash', 'catalog-model', 'snapshot', 'images', 'prerender-db', 'astro', 'check-static', 'astro-preview', 'wrangler', 'wrangler', 'emdash']);
  assert.deepEqual(commands[4], ['images', 'staging']);
  // Prerendering runs EmDash against a local stand-in for this environment's database.
  assert.deepEqual(commands[5], ['prerender-db', 'staging']);
  assert.deepEqual(commands[7], ['check-static']);
  for (const args of commands.filter(x => x[0] === 'emdash')) {
    assert.equal(args[args.indexOf('--d1') + 1], target.databaseId);
    assert.equal(args[args.indexOf('--account-id') + 1], target.accountId);
    assert.equal(args[args.indexOf('--wrangler-env') + 1], 'staging');
  }
  // Migrations run before any build exists, so they read the manifest from the Astro config.
  assert.ok(commands[0].includes('--status') && commands[0].includes('--from-config'));
  assert.ok(commands[1].includes('--from-config') && !commands[1].includes('--check'));
  assert.deepEqual(commands[6], ['astro', 'build']);
  // Both builds finish before the first upload. The generated configs are already flattened, so no --env.
  assert.deepEqual(commands[8], ['astro-preview', 'staging-preview']);
  assert.deepEqual(commands[9], ['wrangler', 'deploy', '-c', 'dist/server/wrangler.json']);
  assert.deepEqual(commands[10], ['wrangler', 'deploy', '-c', 'dist-preview/server/wrangler.json']);
  assert.ok(commands[11].includes('--check') && !commands[11].includes('--from-config'));
});

test('the snapshot step targets the deploy environment', () => {
  const target = validateTarget(config(), 'production');
  assert.deepEqual(deploymentCommands(target)[3], ['snapshot', 'production', false]);
  assert.deepEqual(deploymentCommands(target, { allowEmpty: true })[3], ['snapshot', 'production', true]);
});

test('passes a reviewed fingerprint only when provided', () => {
  const target = validateTarget(config(), 'staging');
  const flag = '--expected-target-fingerprint';
  assert.ok(!deploymentCommands(target).some(args => args.includes(flag)));
  const commands = deploymentCommands(target, { fingerprint: 'fp-reviewed' });
  assert.deepEqual(commands.filter(args => args.includes(flag)).map(args => args[args.indexOf(flag) + 1]), ['fp-reviewed']);
  assert.ok(!commands[0].includes(flag) && !commands[11].includes(flag));
});

test('gated environments must route static assets through the Worker', () => {
  const c = config();
  c.env.staging.vars.FOUNDATION_LOCKED = 'true';
  assert.throws(() => validateTarget(c, 'staging'), /Gated environments must run the Worker before static assets\./);
  c.env.staging.assets = { run_worker_first: true };
  assert.equal(validateTarget(c, 'staging').environment, 'staging');
  // After launch the gate is off and assets may be served directly.
  c.env.production.vars.FOUNDATION_LOCKED = 'false';
  assert.equal(validateTarget(c, 'production').environment, 'production');
});

test('the checked-in Wrangler config: staging live and open, production static with a gated preview', async () => {
  const { readFile } = await import('node:fs/promises');
  const wrangler = JSON.parse(await readFile('wrangler.jsonc', 'utf8'));
  const staging = validateTarget(wrangler, 'staging');
  assert.equal(staging.rendering, 'live');
  assert.equal(staging.preview, undefined);
  assert.equal(wrangler.env['staging-preview'], undefined);
  assert.equal(wrangler.env.staging.vars.FOUNDATION_LOCKED, 'false');
  // The live staging Worker runs the hourly maintenance (scheduled publishing).
  assert.deepEqual(wrangler.env.staging.triggers.crons, ['0 * * * *']);
  const production = validateTarget(wrangler, 'production');
  assert.equal(production.rendering, 'static');
  // Production's preview keeps the gate until its first administrator exists.
  assert.equal(wrangler.env['production-preview'].vars.FOUNDATION_LOCKED, 'true');
  assert.equal(wrangler.env['production-preview'].assets.run_worker_first, true);
});

/** Staging as one live Worker: every page rendered on request, no public partner. */
const liveStaging = () => {
  const c = config();
  delete c.env['staging-preview'];
  c.env.staging.vars = { EMDASH_SITE_URL: origin('staging'), SITE_ROLE: 'preview' };
  return c;
};

test('a live environment is one Worker without a static partner', () => {
  const target = validateTarget(liveStaging(), 'staging');
  assert.equal(target.rendering, 'live');
  assert.equal(target.preview, undefined);
  assert.equal(target.origin, origin('staging'));
  assert.equal(validateTarget(liveStaging(), 'production').rendering, 'static');
});

test('a live environment redirects nobody elsewhere', () => {
  const c = liveStaging();
  c.env.staging.vars.PUBLIC_SITE_URL = origin('production');
  assert.throws(() => validateTarget(c, 'staging'), /live staging environment.*PUBLIC_SITE_URL/);
});

test('a live environment builds and uploads only the server-rendered variant', () => {
  const target = validateTarget(liveStaging(), 'staging');
  const commands = deploymentCommands(target, { fingerprint: 'fp' });
  assert.deepEqual(commands.map(x => x[0]), ['emdash', 'emdash', 'catalog-model', 'astro-preview', 'wrangler', 'emdash']);
  assert.deepEqual(commands[3], ['astro-preview', 'staging']);
  assert.deepEqual(commands[4], ['wrangler', 'deploy', '-c', 'dist-preview/server/wrangler.json']);
  assert.ok(commands[1].includes('fp') && commands[5].includes('--check'));
  for (const args of commands.filter(x => x[0] === 'emdash')) assert.equal(args[args.indexOf('--wrangler-env') + 1], 'staging');
});

test('deploy scripts run like fdag: plain node, authenticated by wrangler login or the CI secret', async () => {
  const { readFile } = await import('node:fs/promises');
  const { scripts } = JSON.parse(await readFile('package.json', 'utf8'));
  for (const name of ['deploy:staging', 'deploy:production', 'migrate:status', 'snapshot']) {
    assert.doesNotMatch(scripts[name], /--env-file/, name);
  }
  assert.equal(scripts['deploy:staging'], 'node scripts/deploy/run.mjs staging');
});

test('migrations use the CI token, or else the wrangler login token, like fdag deploys', async () => {
  const { migrationToken } = await import('../scripts/deploy/target.mjs');
  let asked = 0;
  const login = () => { asked++; return 'oauth-token'; };
  assert.equal(migrationToken({ CLOUDFLARE_API_TOKEN: 'ci-token' }, login), 'ci-token');
  assert.equal(asked, 0);
  assert.equal(migrationToken({}, login), 'oauth-token');
  assert.throws(() => migrationToken({}, () => ''), /pnpm exec wrangler login/);
});

test('the status command is the runner\'s own read-only first step', async () => {
  const { statusCommand } = await import('../scripts/deploy/target.mjs');
  const target = validateTarget(config(), 'staging');
  assert.deepEqual(statusCommand(target), deploymentCommands(target)[0]);
  assert.ok(statusCommand(target).includes('--status') && !statusCommand(target).includes('--expected-target-fingerprint'));
});

test('validates the preview Worker paired with each environment', () => {
  const target = validateTarget(config(), 'staging');
  assert.deepEqual(target.preview, { environment: 'staging-preview', origin: origin('staging-preview') });
  assert.equal(validateTarget(config(), 'production').preview.origin, origin('production-preview'));
});

test('rejects an unpaired or mismatched preview Worker', () => {
  const mutate = (fn, pattern, environment = 'staging') => {
    const c = config();
    fn(c.env[`${environment}-preview`], c.env[environment], c);
    assert.throws(() => validateTarget(c, environment), pattern);
  };
  mutate((p, _, c) => { delete c.env['staging-preview']; }, /staging-preview.*missing/);
  mutate(p => { p.name = 'customseda-staging-other'; }, /name must be customseda-staging-preview/);
  mutate((p, _, c) => { p.d1_databases[0].database_id = c.env.production.d1_databases[0].database_id; }, /same database_id/);
  mutate(p => { p.r2_buckets[0].bucket_name = 'customseda-other-media'; }, /same media bucket/);
  mutate((p, s) => { p.vars.EMDASH_SITE_URL = s.vars.EMDASH_SITE_URL; }, /preview origin must differ/);
  mutate((p, _, c) => { p.vars.EMDASH_SITE_URL = c.env.production.vars.EMDASH_SITE_URL; }, /preview origin must differ/);
  mutate(p => { p.vars.EMDASH_SITE_URL = 'http://localhost:4321'; }, /preview EMDASH_SITE_URL.*HTTPS/);
  mutate(p => { delete p.vars.SITE_ROLE; }, /SITE_ROLE.*preview/);
  mutate((p, s) => { s.vars.SITE_ROLE = 'preview'; }, /live staging environment has no staging-preview partner/);
  mutate((p, s) => { delete s.vars.SITE_ROLE; }, /SITE_ROLE.*"public" or "preview"/);
  mutate(p => { p.vars.PUBLIC_SITE_URL = 'https://elsewhere.example.com'; }, /PUBLIC_SITE_URL/);
  mutate((p, s) => { s.vars.PREVIEW_SITE_URL = 'https://elsewhere.example.com'; }, /PREVIEW_SITE_URL/);
  mutate(p => { p.vars.FOUNDATION_LOCKED = 'true'; }, /Gated.*preview|preview.*before static assets/);
});
