import { mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { parseArgs, parseEnv } from 'node:util';
import { EmDashClient } from 'emdash/client';
import { makeCatalogWorkbook } from './catalog-workbook.mjs';

const usage = 'Usage: pnpm catalog:export --url <EmDash origin> --output <file.xlsx> [--overwrite] (EMDASH_TOKEN in .env)';
let token = process.env.EMDASH_TOKEN;

async function readApi(origin, path) {
 const response = await fetch(new URL(`/_emdash/api/${path}`, origin), {
  headers: { Authorization: `Bearer ${token}` },
  redirect: 'error',
 });
 if (!response.ok) {
  await response.body?.cancel();
  throw new Error(`Could not read EmDash ${path.split('?')[0]} (HTTP ${response.status}).`);
 }
 const { data } = await response.json();
 return data;
}

async function readEntries(client, origin, collection) {
 const entries = [];
 for await (const { id } of client.listAll(collection, { limit: 100 })) {
  const entry = await client.get(collection, id, { raw: true });
  const path = `content/${collection}/${encodeURIComponent(id)}`;
  if (collection === 'products' || collection === 'sizes') {
   const { terms, unresolved } = await readApi(origin, `${path}/terms/category`);
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
    const next = await readApi(origin, `${path}/references/${collection}_${field}/children?${query}`);
    page.children.push(...next.children);
    page.nextCursor = next.nextCursor;
   }
  }
  entries.push(entry);
 }
 return entries;
}

async function saveWorkbook(workbook, output, overwrite) {
 const buffer = await workbook.xlsx.writeBuffer();
 if (!overwrite) {
  try {
   await writeFile(output, buffer, { flag: 'wx', mode: 0o600 });
  } catch (error) {
   if (error.code !== 'EEXIST') throw error;
   throw new Error(`${output} already exists. Pass --overwrite to replace it.`);
  }
  return;
 }

 // Stage the replacement on the same filesystem before swapping it into place.
 const directory = await mkdtemp(join(dirname(output), '.catalog-export-'));
 try {
  const replacement = join(directory, 'catalog.xlsx');
  await writeFile(replacement, buffer, { mode: 0o600 });
  await rename(replacement, output);
 } finally {
  await rm(directory, { recursive: true, force: true });
 }
}

async function main() {
 const { values } = parseArgs({ options: {
  url: { type: 'string' }, output: { type: 'string' },
  overwrite: { type: 'boolean' }, help: { type: 'boolean' },
 } });
 if (values.help) {
  console.log(usage);
  return;
 }
 if (!values.url || !values.output?.toLowerCase().endsWith('.xlsx')) throw new Error(usage);
 if (!token) {
  const source = await readFile('.env', 'utf8').catch((error) => {
   if (error.code !== 'ENOENT') throw error;
   return '';
  });
  token = parseEnv(source).EMDASH_TOKEN;
 }
 if (!token) throw new Error('Add EMDASH_TOKEN to .env with content and draft read access.');
 const url = new URL(values.url);
 const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
 if ((url.protocol !== 'https:' && !(loopback && url.protocol === 'http:'))
     || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
  throw new Error('Use an HTTPS EmDash origin, or HTTP on loopback.');
 }
 // Regular list requests can silently filter out drafts. This GET requires draft access.
 const draftAccess = await fetch(new URL('/_emdash/api/content/products/trash?limit=1', url), {
  headers: { Authorization: `Bearer ${token}` },
  redirect: 'error',
 });
 await draftAccess.body?.cancel();
 if (!draftAccess.ok) throw new Error(`Could not verify EmDash draft read access (HTTP ${draftAccess.status}).`);

 const client = new EmDashClient({ baseUrl: url.origin, token });
 const catalog = {};
 for (const collection of ['products', 'collections', 'materials', 'colors', 'sizes', 'size_guides']) {
  catalog[collection] = await readEntries(client, url.origin, collection);
 }
 catalog.categories = (await client.terms('category', { includeCounts: false })).items;
 await saveWorkbook(makeCatalogWorkbook(catalog), values.output, values.overwrite);
 console.log(`Exported ${catalog.products.length} products and their catalog lookups to ${values.output}.`);
}

main().catch((error) => {
 console.error(token ? error.message.replaceAll(token, '[redacted]') : error.message);
 process.exitCode = 1;
});
