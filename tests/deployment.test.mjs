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

test('migrates the explicit database before uploading and checks afterwards', () => {
  const target = validateTarget(config(), 'staging');
  const commands = deploymentCommands(target);
  assert.deepEqual(commands.map(x => x[0]), ['astro', 'emdash', 'emdash', 'catalog-model', 'wrangler', 'emdash']);
  assert.deepEqual(commands[0], ['astro', 'build']);
  for (const args of commands.filter(x => x[0] === 'emdash')) {
    assert.equal(args[args.indexOf('--d1') + 1], target.databaseId);
    assert.equal(args[args.indexOf('--account-id') + 1], target.accountId);
    assert.equal(args[args.indexOf('--wrangler-env') + 1], 'staging');
  }
  assert.ok(commands[1].includes('--status'));
  assert.ok(!commands[2].includes('--check'));
  assert.deepEqual(commands[4], ['wrangler', 'deploy', '--env', 'staging']);
  assert.ok(commands[5].includes('--check'));
});
