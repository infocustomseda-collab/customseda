import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { validateTarget, deploymentCommands } from './target.mjs';
import { withDeploymentLock } from './lock.mjs';
import { remoteCatalogModel } from '../cms/remote-model.mjs';

try {
  const target = validateTarget(JSON.parse(await readFile('wrangler.jsonc', 'utf8')), process.argv[2]);
  const env = { ...process.env, CLOUDFLARE_ENV: target.environment, CLOUDFLARE_ACCOUNT_ID: target.accountId };
  console.log(`Target: ${target.environment} | ${target.origin} | D1 ${target.databaseId}`);
  await withDeploymentLock('.emdash', target.environment, async () => {
    for (const [tool, ...args] of deploymentCommands(target)) {
      if (tool === 'catalog-model') {
        const model = await remoteCatalogModel(target);
        console.log(`${model.version}: ${model.applied ? 'applied' : 'present'}.`);
        continue;
      }
      const result = spawnSync('pnpm', ['exec', tool, ...args], { stdio: 'inherit', env });
      if (result.error) throw result.error;
      if (result.status !== 0) throw Object.assign(new Error(`${tool} failed; deployment stopped.`), { exitCode: result.status ?? 1 });
    }
  });
} catch (error) {
  console.error(error.message);
  process.exitCode = error.exitCode ?? 1;
}
