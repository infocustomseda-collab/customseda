import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { validateTarget, deploymentCommands, migrationToken } from './target.mjs';
import { wranglerLoginToken } from './login-token.mjs';
import { withDeploymentLock } from './lock.mjs';
import { remoteCatalogModel } from '../cms/remote-model.mjs';
import { writeSnapshot } from '../build/snapshot.mjs';
import { buildImages } from '../build/images.mjs';
import { migratePrerenderDatabase } from '../build/prerender-db.mjs';
import { checkStaticBuild } from '../build/check-static.mjs';

try {
  const [environment, ...flags] = process.argv.slice(2);
  if (flags.some(flag => flag !== '--allow-empty')) throw new Error('Usage: pnpm deploy:<staging|production> [--allow-empty]');
  const target = validateTarget(JSON.parse(await readFile('wrangler.jsonc', 'utf8')), environment);
  // Resolved first so a missing login never leaves a half-run deploy.
  const token = migrationToken(process.env, wranglerLoginToken);
  // CI passes the reviewed fingerprint; interactive runs leave it unset and confirm the target.
  const fingerprint = process.env.EMDASH_EXPECTED_TARGET_FINGERPRINT || undefined;
  const env = { ...process.env, CLOUDFLARE_ENV: target.environment, CLOUDFLARE_ACCOUNT_ID: target.accountId };
  console.log(`Target: ${target.environment} | ${target.origin} | D1 ${target.databaseId}`);
  await withDeploymentLock('.emdash', target.environment, async () => {
    for (const [tool, ...args] of deploymentCommands(target, { fingerprint, allowEmpty: flags.includes('--allow-empty') })) {
      if (tool === 'snapshot') {
        await writeSnapshot({ environment: args[0], allowEmpty: args[1] });
        continue;
      }
      if (tool === 'prerender-db') {
        await migratePrerenderDatabase(args[0]);
        continue;
      }
      if (tool === 'check-static') {
        console.log(`Static build: ${(await checkStaticBuild()).pages} pages checked.`);
        continue;
      }
      if (tool === 'astro-preview') {
        const build = spawnSync('pnpm', ['exec', 'astro', 'build'], { stdio: 'inherit', env: { ...env, SITE_MODE: 'preview', CLOUDFLARE_ENV: args[0] } });
        if (build.error) throw build.error;
        if (build.status !== 0) throw Object.assign(new Error('astro preview build failed; deployment stopped.'), { exitCode: build.status ?? 1 });
        continue;
      }
      if (tool === 'images') {
        await buildImages({ environment: args[0] });
        continue;
      }
      if (tool === 'catalog-model') {
        const model = await remoteCatalogModel(target);
        console.log(`${model.version}: ${model.applied ? 'applied' : 'present'}.`);
        continue;
      }
      // Only EmDash's migration CLI gets the token; Wrangler uses its own login (or the CI token).
      const result = spawnSync('pnpm', ['exec', tool, ...args], { stdio: 'inherit', env: tool === 'emdash' ? { ...env, CLOUDFLARE_API_TOKEN: token } : env });
      if (result.error) throw result.error;
      if (result.status !== 0) throw Object.assign(new Error(`${tool} failed; deployment stopped.`), { exitCode: result.status ?? 1 });
    }
  });
} catch (error) {
  console.error(error.message);
  process.exitCode = error.exitCode ?? 1;
}
