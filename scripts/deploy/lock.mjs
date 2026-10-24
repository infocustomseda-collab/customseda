import { mkdir, open, unlink } from 'node:fs/promises';
import { join } from 'node:path';

/** Both environments share dist and migration manifests: lock the whole checkout. */
export async function withDeploymentLock(root, environment, task) {
  await mkdir(root, { recursive: true });
  const path = join(root, 'deploy.lock');
  let lock;
  try {
    lock = await open(path, 'wx', 0o600);
  } catch (error) {
    if (error.code === 'EEXIST') throw new Error(`A deployment is already running, or a stale lock exists: ${path}`);
    throw error;
  }
  try {
    await lock.writeFile(`${process.pid}\n${environment}\n`);
    return await task();
  } finally {
    await lock.close();
    await unlink(path);
  }
}
