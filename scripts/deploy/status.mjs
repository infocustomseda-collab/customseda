import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { migrationToken, statusCommand, validateTarget } from './target.mjs';
import { wranglerLoginToken } from './login-token.mjs';

// Read-only: prints migration status and the target fingerprint to review for CI.
try {
  const target = validateTarget(JSON.parse(await readFile('wrangler.jsonc', 'utf8')), process.argv[2]);
  const token = migrationToken(process.env, wranglerLoginToken);
  const [tool, ...args] = statusCommand(target);
  const result = spawnSync('pnpm', ['exec', tool, ...args], { stdio: 'inherit', env: { ...process.env, CLOUDFLARE_ENV: target.environment, CLOUDFLARE_API_TOKEN: token } });
  process.exitCode = result.status ?? 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
