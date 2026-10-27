import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateTarget, deploymentCommands } from '../scripts/deploy/target.mjs';

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
  assert.deepEqual(commands.map(x => x[0]), ['emdash', 'emdash', 'catalog-model', 'snapshot', 'images', 'prerender-db', 'astro', 'check-static', 'wrangler', 'emdash']);
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
  assert.deepEqual(commands[8], ['wrangler', 'deploy', '--env', 'staging']);
  assert.ok(commands[9].includes('--check') && !commands[9].includes('--from-config'));
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
  assert.ok(!commands[0].includes(flag) && !commands[9].includes(flag));
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

test('the checked-in Wrangler config gates assets in both remote environments', async () => {
  const { readFile } = await import('node:fs/promises');
  const wrangler = JSON.parse(await readFile('wrangler.jsonc', 'utf8'));
  for (const name of ['staging', 'production']) {
    assert.equal(validateTarget(wrangler, name).environment, name);
    assert.equal(wrangler.env[`${name}-preview`].assets.run_worker_first, true);
  }
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
  mutate((p, s) => { s.vars.SITE_ROLE = 'preview'; }, /SITE_ROLE.*public/);
  mutate(p => { p.vars.PUBLIC_SITE_URL = 'https://elsewhere.example.com'; }, /PUBLIC_SITE_URL/);
  mutate((p, s) => { s.vars.PREVIEW_SITE_URL = 'https://elsewhere.example.com'; }, /PREVIEW_SITE_URL/);
  mutate(p => { p.vars.FOUNDATION_LOCKED = 'true'; }, /Gated.*preview|preview.*before static assets/);
});
