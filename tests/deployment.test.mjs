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
const PRODUCTION_DB = '12345678-1234-1234-1234-123456789abc';
/** Production: static storefront and CMS. Staging: live reader of production's database, bucket and sessions. */
const config = () => {
  const shared = () => ({
    d1_databases: [{ binding: 'DB', database_name: 'customseda-production', database_id: PRODUCTION_DB }],
    r2_buckets: [{ binding: 'MEDIA', bucket_name: 'customseda-production-media' }],
    kv_namespaces: [{ binding: 'SESSION', id: 'f'.repeat(32) }],
  });
  return {
    account_id: 'a'.repeat(32),
    env: {
      staging: {
        name: 'customseda-staging',
        vars: { EMDASH_SITE_URL: origin('staging'), SITE_ROLE: 'preview', CMS_ORIGIN: origin('production'), FOUNDATION_LOCKED: 'true' },
        assets: { run_worker_first: true },
        triggers: { crons: [] },
        ...shared(),
      },
      production: {
        name: 'customseda',
        vars: { EMDASH_SITE_URL: origin('production'), SITE_ROLE: 'public', SSR_PREVIEW_URL: origin('staging'), FOUNDATION_LOCKED: 'false' },
        triggers: { crons: ['0 * * * *'] },
        ...shared(),
      },
    },
  };
};

test('requires an explicit remote environment', () => {
  for (const env of [undefined, '', 'local', 'master', '--production']) {
    assert.throws(() => validateTarget(config(), env), /staging or production/);
  }
});

test('rejects missing provisioning and unsafe authentication origins', () => {
  const c = config();
  delete c.env.production.d1_databases[0].database_id;
  assert.throws(() => validateTarget(c, 'production'), /database UUID/);
  c.env.production.d1_databases[0].database_id = '00000000-0000-0000-0000-000000000000';
  assert.throws(() => validateTarget(c, 'production'), /database UUID/);
  for (const value of ['', 'http://localhost:4321', 'https://user:password@example.com', 'https://example.com/path']) {
    const d = config();
    d.env.staging.vars.EMDASH_SITE_URL = value;
    assert.throws(() => validateTarget(d, 'staging'), /HTTPS origin/);
  }
});

test('rejects missing or shared Worker names and normalized environment origins', () => {
  for (const name of ['', 'customseda-staging']) {
    const c = config();
    c.env.production.name = name;
    assert.throws(() => validateTarget(c, 'production'), /distinct.*Worker/);
  }
  const c = config();
  c.env.production.vars.EMDASH_SITE_URL = c.env.staging.vars.EMDASH_SITE_URL + '/';
  assert.throws(() => validateTarget(c, 'production'), /distinct.*origin/);
});

test('production migrates the explicit database, then snapshots, builds, uploads one Worker and checks', () => {
  const target = validateTarget(config(), 'production');
  const commands = deploymentCommands(target);
  assert.deepEqual(commands.map(x => x[0]), ['emdash', 'emdash', 'catalog-model', 'snapshot', 'images', 'prerender-db', 'astro', 'check-static', 'wrangler', 'emdash']);
  assert.deepEqual(commands[4], ['images', 'production']);
  // Prerendering runs EmDash against a local stand-in for this environment's database.
  assert.deepEqual(commands[5], ['prerender-db', 'production']);
  assert.deepEqual(commands[7], ['check-static']);
  for (const args of commands.filter(x => x[0] === 'emdash')) {
    assert.equal(args[args.indexOf('--d1') + 1], target.databaseId);
    assert.equal(args[args.indexOf('--account-id') + 1], target.accountId);
    assert.equal(args[args.indexOf('--wrangler-env') + 1], 'production');
  }
  // Migrations run before any build exists, so they read the manifest from the Astro config.
  assert.ok(commands[0].includes('--status') && commands[0].includes('--from-config'));
  assert.ok(commands[1].includes('--from-config') && !commands[1].includes('--check'));
  assert.deepEqual(commands[6], ['astro', 'build']);
  // The generated config is already flattened, so no --env.
  assert.deepEqual(commands[8], ['wrangler', 'deploy', '-c', 'dist/server/wrangler.json']);
  assert.ok(commands[9].includes('--check') && !commands[9].includes('--from-config'));
  assert.equal(commands.some(c => c[0] === 'astro-preview' || c.includes('dist-preview/server/wrangler.json')), false);
});

test('the snapshot step targets the deploy environment', () => {
  const target = validateTarget(config(), 'production');
  assert.deepEqual(deploymentCommands(target)[3], ['snapshot', 'production', false]);
  assert.deepEqual(deploymentCommands(target, { allowEmpty: true })[3], ['snapshot', 'production', true]);
});

test('passes a reviewed fingerprint only when provided', () => {
  const target = validateTarget(config(), 'production');
  const flag = '--expected-target-fingerprint';
  assert.ok(!deploymentCommands(target).some(args => args.includes(flag)));
  const commands = deploymentCommands(target, { fingerprint: 'fp-reviewed' });
  assert.deepEqual(commands.filter(args => args.includes(flag)).map(args => args[args.indexOf(flag) + 1]), ['fp-reviewed']);
  assert.ok(!commands[0].includes(flag) && !commands[9].includes(flag));
});

test('gated environments must route static assets through the Worker', () => {
  const c = config();
  delete c.env.staging.assets;
  assert.throws(() => validateTarget(c, 'staging'), /Gated environments must run the Worker before static assets\./);
  const d = config();
  d.env.production.vars.FOUNDATION_LOCKED = 'true';
  assert.throws(() => validateTarget(d, 'production'), /Gated environments/);
  // After launch the gate is off and assets may be served directly.
  assert.equal(validateTarget(config(), 'production').environment, 'production');
});

test('the checked-in config deploys a static production with its CMS and a live staging reader', async () => {
  const { readFile } = await import('node:fs/promises');
  const wrangler = JSON.parse(await readFile('wrangler.jsonc', 'utf8'));
  assert.deepEqual(Object.keys(wrangler.env).sort(), ['production', 'staging']);
  const staging = validateTarget(wrangler, 'staging');
  assert.equal(staging.rendering, 'live');
  assert.equal(staging.shared, true);
  assert.equal(wrangler.env.staging.vars.FOUNDATION_LOCKED, 'true');
  assert.equal(wrangler.env.staging.assets?.run_worker_first, true);
  assert.equal(wrangler.env.staging.vars.PRIVATE_SITE, undefined);
  assert.equal(wrangler.env.staging.send_email, undefined);
  // Production hosts the CMS, so it runs the hourly maintenance (scheduled publishing).
  assert.deepEqual(wrangler.env.production.triggers.crons, ['0 * * * *']);
  const production = validateTarget(wrangler, 'production');
  assert.equal(production.rendering, 'static');
  assert.equal(production.previewOrigin, staging.origin);
  assert.equal(wrangler.env.production.name, 'customseda');
  assert.equal(wrangler.env.production.vars.FOUNDATION_LOCKED, 'false');
  assert.notEqual(wrangler.env.production.assets?.run_worker_first, true);
  assert.deepEqual(deploymentCommands(production).filter(c => c[0] === 'wrangler'), [['wrangler', 'deploy', '-c', 'dist/server/wrangler.json']]);
});

test('production is static and names staging as its SSR preview', () => {
  const target = validateTarget(config(), 'production');
  assert.equal(target.rendering, 'static');
  assert.equal(target.previewOrigin, origin('staging'));
  for (const [environment, mutate] of [
    ['production', c => { c.env.production.vars.SSR_PREVIEW_URL = 'https://wrong.example'; }],
    ['production', c => { delete c.env.production.vars.SSR_PREVIEW_URL; }],
    ['production', c => { c.env.production.vars.SITE_ROLE = 'preview'; }],
    ['staging', c => { c.env.staging.vars.SITE_ROLE = 'public'; }],
  ]) {
    const c = config(); mutate(c);
    assert.throws(() => validateTarget(c, environment), undefined, `${environment}: ${mutate}`);
  }
  const c = config(); delete c.env.production.vars.SITE_ROLE;
  assert.throws(() => validateTarget(c, 'production'), /SITE_ROLE/);
});

test('staging must share production database, bucket and session store, and point CMS_ORIGIN at production', () => {
  assert.equal(validateTarget(config(), 'staging').shared, true);
  for (const mutate of [
    c => { c.env.staging.d1_databases[0].database_id = '92345678-1234-1234-1234-123456789abc'; },
    c => { c.env.staging.r2_buckets[0].bucket_name = 'other'; },
    c => { c.env.staging.kv_namespaces[0].id = 'other'; },
    c => { delete c.env.staging.kv_namespaces; },
    c => { c.env.staging.vars.CMS_ORIGIN = 'https://wrong.example'; },
    c => { c.env.staging.vars.FOUNDATION_LOCKED = 'false'; },
    c => { c.env.staging.triggers = { crons: ['0 * * * *'] }; },
  ]) {
    const c = config(); mutate(c);
    assert.throws(() => validateTarget(c, 'staging'), undefined, mutate.toString());
  }
});

test('staging deploy is read-only on the shared database and checks before uploading', () => {
  const commands = deploymentCommands(validateTarget(config(), 'staging'), { fingerprint: 'fp' });
  assert.deepEqual(commands.map(x => x[0]), ['emdash', 'catalog-model-check', 'astro-preview', 'emdash', 'wrangler']);
  assert.ok(commands[0].includes('--status') && commands[3].includes('--check'));
  assert.deepEqual(commands[2], ['astro-preview', 'staging']);
  assert.deepEqual(commands[4], ['wrangler', 'deploy', '-c', 'dist-preview/server/wrangler.json']);
  assert.equal(commands.some(c => c[0] === 'catalog-model' || c.includes('fp')), false);
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
  for (const environment of ['staging', 'production']) {
    const target = validateTarget(config(), environment);
    assert.deepEqual(statusCommand(target), deploymentCommands(target)[0]);
    assert.ok(statusCommand(target).includes('--status') && !statusCommand(target).includes('--expected-target-fingerprint'));
  }
  const target = validateTarget(config(), 'staging');
  assert.ok(statusCommand(target).includes('--status') && !statusCommand(target).includes('--expected-target-fingerprint'));
});

