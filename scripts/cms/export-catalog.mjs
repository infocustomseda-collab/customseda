import { writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { EmDashClient } from 'emdash/client';
import ExcelJS from 'exceljs';

const usage = 'Usage: pnpm catalog:export --url <EmDash origin> --output <file.xlsx> (set EMDASH_TOKEN)';

async function readEntries(client, collection) {
 const entries = [];
 for await (const { id } of client.listAll(collection, { limit: 100 })) {
  entries.push(await client.get(collection, id, { raw: true }));
 }
 return entries;
}

function jsonCell(value, field, id) {
 if (value === undefined) return null;
 const json = JSON.stringify(value);
 if (json.length > 32_767) throw new Error(`${field} on entry ${id} exceeds Excel's cell limit.`);
 return json;
}

function galleryBackup(entry) {
 const { id, status, data, draftRevisionId, liveRevisionId, liveData } = entry;
 if (draftRevisionId && !liveData) throw new Error(`Could not read both gallery versions for ${id}.`);
 const hasPublishedVersion = status === 'published' || Boolean(liveRevisionId);
 return jsonCell({
  published: hasPublishedVersion ? (liveData ?? data).gallery : undefined,
  draft: draftRevisionId || !hasPublishedVersion ? data.gallery : undefined,
 }, 'Gallery', id);
}

function baseRow(entry) {
 return [entry.id, entry.slug, entry.locale, entry.status, entry._rev, entry.data.title];
}

function references(entry, field) {
 const page = entry.references?.[field];
 if (page?.nextCursor) throw new Error(`Cannot export all ${field} references for entry ${entry.id} in this version.`);
 return page?.children ?? [];
}

function titles(entry, field) {
 return references(entry, field).map(({ title }) => title);
}

function makeWorkbook(products, collections) {
 const workbook = new ExcelJS.Workbook();
 const collectionsById = new Map(collections.map(({ id, data }) => [id, data.title]));
 const productSheet = workbook.addWorksheet('Products', { views: [{ state: 'frozen', ySplit: 1 }] });
 const collectionSheet = workbook.addWorksheet('Collections', { views: [{ state: 'frozen', ySplit: 1 }] });
 const baseColumns = [
  { header: 'ID', width: 30 },
  { header: 'Slug', width: 26 },
  { header: 'Locale', width: 11 },
  { header: 'Status', width: 14 },
  { header: 'Revision', width: 30 },
  { header: 'Title', width: 28 },
 ];
 productSheet.columns = [...baseColumns,
  { header: 'Summary', width: 36 },
  { header: 'Price (EUR)', width: 15 },
  { header: 'Collection', key: 'collection', width: 26 },
  { header: 'Material', width: 26 },
  { header: 'Size Guide', width: 26 },
  { header: 'Bundle', width: 12 },
  { header: 'Components', width: 28 },
  { header: 'Description', width: 38 },
  { header: 'Gallery', width: 38 },
 ];
 for (const entry of products) {
  const { id, data } = entry;
  const [collection] = references(entry, 'collection');
  const collectionTitle = collection && (collectionsById.get(collection.id) ?? collection.title);
  productSheet.addRow([...baseRow(entry), data.summary,
   data.price_cents == null ? null : data.price_cents / 100,
   collectionTitle, titles(entry, 'material')[0], titles(entry, 'size_guide')[0],
   data.bundle, jsonCell(titles(entry, 'components'), 'Components', id),
   jsonCell(data.description, 'Description', id), galleryBackup(entry),
  ]);
 }
 productSheet.getRow(1).font = { bold: true };
 productSheet.getColumn(8).numFmt = '0.00';
 productSheet.autoFilter = 'A1:O1';

 const collectionColumns = [...baseColumns, { header: 'Code', width: 18 },
  { header: 'Description', width: 38 }, { header: 'Image', width: 38 }];
 collectionSheet.addTable({
  name: 'CatalogCollections',
  ref: 'A1',
  columns: collectionColumns.map(({ header }) => ({ name: header, filterButton: true })),
  rows: collections.length ? collections.map((entry) => [
   ...baseRow(entry), entry.data.code, jsonCell(entry.data.description, 'Description', entry.id),
   jsonCell(entry.data.image, 'Image', entry.id),
  ]) : [[]],
 });
 collectionColumns.forEach(({ width }, i) => { collectionSheet.getColumn(i + 1).width = width; });

 const letter = productSheet.getColumn('collection').letter;
 productSheet.dataValidations.add(`${letter}2:${letter}${Math.max(1000, products.length + 1)}`, {
  type: 'list',
  allowBlank: true,
  showErrorMessage: true,
  errorStyle: 'stop',
  errorTitle: 'Unknown collection',
  error: 'Choose a collection title from the list.',
  formulae: ['INDIRECT("CatalogCollections[Title]")'],
 });
 return workbook;
}

async function main() {
 const { values } = parseArgs({ options: {
  url: { type: 'string' }, output: { type: 'string' }, help: { type: 'boolean' },
 } });
 if (values.help) {
  console.log(usage);
  return;
 }
 if (!values.url || !values.output?.toLowerCase().endsWith('.xlsx')) throw new Error(usage);
 const token = process.env.EMDASH_TOKEN;
 if (!token) throw new Error('Set EMDASH_TOKEN to an EmDash token with content and draft read access.');
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
 const collections = await readEntries(client, 'collections');
 const products = await readEntries(client, 'products');
 const workbook = makeWorkbook(products, collections);
 await writeFile(values.output, await workbook.xlsx.writeBuffer(), { flag: 'wx', mode: 0o600 });
 console.log(`Exported ${products.length} products and ${collections.length} collections to ${values.output}.`);
}

main().catch((error) => {
 const token = process.env.EMDASH_TOKEN;
 console.error(token ? error.message.replaceAll(token, '[redacted]') : error.message);
 process.exitCode = 1;
});
