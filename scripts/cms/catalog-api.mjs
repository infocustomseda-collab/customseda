import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { EmDashClient } from 'emdash/client';

export async function readCatalogToken() {
 if (process.env.EMDASH_TOKEN) return process.env.EMDASH_TOKEN;
 const source = await readFile('.env', 'utf8').catch((error) => {
  if (error.code !== 'ENOENT') throw error;
  return '';
 });
 const token = parseEnv(source).EMDASH_TOKEN;
 if (!token) throw new Error('Add EMDASH_TOKEN to .env with content and draft read access.');
 return token;
}

export async function connectCatalog(origin, token) {
 const url = new URL(origin);
 const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
 if ((url.protocol !== 'https:' && !(loopback && url.protocol === 'http:'))
     || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
  throw new Error('Use an HTTPS EmDash origin, or HTTP on loopback.');
 }
 function request(path) {
  return fetch(new URL(`/_emdash/api/${path}`, url), {
   headers: { Authorization: `Bearer ${token}` },
   redirect: 'error',
  });
 }
 // Regular list requests can silently filter out drafts. This GET requires draft access.
 const draftAccess = await request('content/products/trash?limit=1');
 await draftAccess.body?.cancel();
 if (!draftAccess.ok) throw new Error(`Could not verify EmDash draft read access (HTTP ${draftAccess.status}).`);

 return {
  client: new EmDashClient({ baseUrl: url.origin, token }),
  async read(path) {
   const response = await request(path);
   if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Could not read EmDash ${path.split('?')[0]} (HTTP ${response.status}).`);
   }
   const { data } = await response.json();
   return data;
  },
 };
}
