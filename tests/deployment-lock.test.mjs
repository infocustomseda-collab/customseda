import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { withDeploymentLock } from '../scripts/deploy/lock.mjs';

test('staging and production cannot overwrite shared artifacts while a deployment holds the checkout lock', async () => {
  const root = await mkdtemp(join(tmpdir(), 'seda-deploy-'));
  let release;
  let entered;
  const started = new Promise(resolve => { entered = resolve; });
  const waiting = new Promise(resolve => { release = resolve; });
  const first = withDeploymentLock(root, 'staging', async () => { entered(); await waiting; });
  try {
    await started;
    await assert.rejects(withDeploymentLock(root, 'staging', async () => assert.fail('must not enter')), /already running/);
    await assert.rejects(withDeploymentLock(root, 'production', async () => assert.fail('must not enter')), /already running/);
  } finally {
    release();
    await first;
    await rm(root, { recursive: true });
  }
});

test('a failed deployment releases its lock so a corrected run can proceed', async () => {
  const root = await mkdtemp(join(tmpdir(), 'seda-deploy-'));
  try {
    await assert.rejects(withDeploymentLock(root, 'staging', async () => { throw new Error('migration failed'); }), /migration failed/);
    assert.equal(await withDeploymentLock(root, 'staging', async () => 'retry'), 'retry');
  } finally {
    await rm(root, { recursive: true });
  }
});
