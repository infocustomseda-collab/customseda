import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { statusCommand, validateTarget } from './target.mjs';

// Read-only: prints migration status and the target fingerprint to review for CI.
try {
  const target = validateTarget(JSON.parse(await readFile('wrangler.jsonc', 'utf8')), process.argv[2]);
  const [tool, ...args] = statusCommand(target);
  const result = spawnSync('pnpm', ['exec', tool, ...args], { stdio: 'inherit', env: { ...process.env, CLOUDFLARE_ENV: target.environment } });
  process.exitCode = result.status ?? 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
