import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateTarget, deploymentCommands } from '../scripts/deploy/target.mjs';

const config = () => ({
  account_id: 'a'.repeat(32),
  env: Object.fromEntries(['staging', 'production'].map((name, index) => [name, {
    name: `customseda-${name}`,
    vars: { EMDASH_SITE_URL: `https://customseda-${name}.example.workers.dev` },
    d1_databases: [{ binding: 'DB', database_name: `customseda-${name}`, database_id: `${index + 1}2345678-1234-1234-1234-123456789abc` }],
    r2_buckets: [{ binding: 'MEDIA', bucket_name: `customseda-${name}-media` }],
  }])),
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
  assert.throws(() => validateTarget(c, 'production'), /distinct.*origin/);
});

test('migrates the explicit database, then snapshots, builds, uploads and checks', () => {
  const target = validateTarget(config(), 'staging');
  const commands = deploymentCommands(target);
  assert.deepEqual(commands.map(x => x[0]), ['emdash', 'emdash', 'catalog-model', 'snapshot', 'images', 'astro', 'wrangler', 'emdash']);
  assert.deepEqual(commands[4], ['images', 'staging']);
  for (const args of commands.filter(x => x[0] === 'emdash')) {
    assert.equal(args[args.indexOf('--d1') + 1], target.databaseId);
    assert.equal(args[args.indexOf('--account-id') + 1], target.accountId);
    assert.equal(args[args.indexOf('--wrangler-env') + 1], 'staging');
  }
  // Migrations run before any build exists, so they read the manifest from the Astro config.
  assert.ok(commands[0].includes('--status') && commands[0].includes('--from-config'));
  assert.ok(commands[1].includes('--from-config') && !commands[1].includes('--check'));
  assert.deepEqual(commands[5], ['astro', 'build']);
  assert.deepEqual(commands[6], ['wrangler', 'deploy', '--env', 'staging']);
  assert.ok(commands[7].includes('--check') && !commands[7].includes('--from-config'));
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
  assert.ok(!commands[0].includes(flag) && !commands[7].includes(flag));
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
  for (const name of ['staging', 'production']) assert.equal(validateTarget(wrangler, name).environment, name);
});
