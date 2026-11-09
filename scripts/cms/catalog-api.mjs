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
 function request(path, options) {
  return fetch(new URL(`/_emdash/api/${path}`, url), {
   ...options,
   headers: { Authorization: `Bearer ${token}`, ...options?.headers },
   redirect: 'error',
  });
 }
 // Regular list requests can silently filter out drafts. This GET requires draft access.
 const draftAccess = await request('content/products/trash?limit=1');
 await draftAccess.body?.cancel();
 if (!draftAccess.ok) throw new Error(`Could not verify EmDash draft read access (HTTP ${draftAccess.status}).`);

 return {
  origin: url.origin,
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
  async write(method, path, body) {
   const response = await request(path, {
    method, body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' },
   });
   const result = await response.json().catch(() => null);
   if (!response.ok || !result?.success) {
    throw new Error(`EmDash refused ${method} ${path.split('?')[0]} (HTTP ${response.status}): ${result?.error?.message ?? 'no error details'}`);
   }
   return result.data;
  },
 };
}

async function readEntries(client, read, collection) {
 const entries = [];
 for await (const { id } of client.listAll(collection, { limit: 100 })) {
  const entry = await client.get(collection, id, { raw: true });
  const path = `content/${collection}/${encodeURIComponent(id)}`;
  if (collection === 'products' || collection === 'sizes') {
   const { terms, unresolved } = await read(`${path}/terms/category`);
   if (terms.length > 1 || unresolved?.length) throw new Error(`Cannot resolve a single category for ${collection}/${id}.`);
   entry.categoryId = terms[0]?.id;
  }
  for (const [field, page] of Object.entries(entry.references ?? {})) {
   const cursors = new Set();
   while (page.nextCursor) {
    const cursor = page.nextCursor;
    if (cursors.has(cursor)) throw new Error(`Repeated ${field} cursor for ${collection}/${id}.`);
    cursors.add(cursor);
    const query = new URLSearchParams({ cursor });
    const next = await read(`${path}/references/${collection}_${field}/children?${query}`);
    page.children.push(...next.children);
    page.nextCursor = next.nextCursor;
   }
  }
  entries.push(entry);
 }
 return entries;
}

export const catalogCollections = ['products', 'collections', 'materials', 'colors', 'sizes', 'size_guides'];

export async function readCatalog({ client, read }) {
 const catalog = {};
 for (const collection of catalogCollections) catalog[collection] = await readEntries(client, read, collection);
 catalog.categories = (await client.terms('category', { includeCounts: false })).items;
 return catalog;
}

export async function readTrashSlugs(read, collection) {
 const slugs = new Set(), cursors = new Set();
 let cursor;
 do {
  const query = new URLSearchParams({ limit: '100' });
  if (cursor) query.set('cursor', cursor);
  const page = await read(`content/${collection}/trash?${query}`);
  for (const { slug, locale } of page.items) slugs.add(JSON.stringify([slug, locale]));
  cursor = page.nextCursor;
  if (cursor && cursors.has(cursor)) throw new Error(`Repeated cursor while reading ${collection} Trash.`);
  cursors.add(cursor);
 } while (cursor);
 return slugs;
}
