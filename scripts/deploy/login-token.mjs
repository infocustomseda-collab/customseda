import { spawnSync } from 'node:child_process';

/** The access token of the current `wrangler login` (refreshed by Wrangler), or '' when logged out. */
export function wranglerLoginToken() {
  const env = { ...process.env };
  delete env.CLOUDFLARE_API_TOKEN;
  const result = spawnSync('pnpm', ['exec', 'wrangler', 'auth', 'token'], { env, encoding: 'utf8' });
  if (result.status !== 0) return '';
  return result.stdout.trim().split('\n').at(-1)?.trim() ?? '';
}
