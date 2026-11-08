import { parseArgs } from 'node:util';
import ExcelJS from 'exceljs';
import seed from '../../seed/seed.json' with { type: 'json' };
import { connectCatalog, readCatalogToken } from './catalog-api.mjs';

const usage = 'Usage: pnpm catalog:import:preview --url <EmDash origin> --input <file.xlsx>';
const referenceFields = [
 { header: 'Collection', field: 'collection', collection: 'collections' },
 { header: 'Material', field: 'material', collection: 'materials' },
 { header: 'Size Guide', field: 'size_guide', collection: 'size_guides' },
];
const editable = ['Title', 'Summary', 'Price (EUR)', ...referenceFields.map(({ header }) => header)];
const headers = ['ID', 'Slug', 'Locale', 'Revision', ...editable];
const blank = (value) => value == null || (typeof value === 'string' && value.trim() === '');
const slugKey = (slug, locale) => JSON.stringify([slug, locale]);
const rowKey = ({ ID, Slug, Locale }) => blank(ID) ? slugKey(Slug, Locale) : ID;

async function readRows(path) {
 const workbook = new ExcelJS.Workbook();
 await workbook.xlsx.readFile(path);
 const sheet = workbook.getWorksheet('Products');
 if (!sheet) throw new Error('The workbook must contain a Products sheet.');
 const columns = new Map();
 sheet.getRow(1).eachCell((cell, index) => {
  if (!headers.includes(cell.value)) return;
  if (columns.has(cell.value)) throw new Error(`Products has more than one "${cell.value}" column.`);
  columns.set(cell.value, index);
 });
 const missing = headers.filter((header) => !columns.has(header));
 if (missing.length) throw new Error(`Missing Products columns: ${missing.join(', ')}.`);
 const rows = [];
 sheet.eachRow((row, index) => {
  if (index === 1) return;
  const values = Object.fromEntries(headers.map((header) => [header, row.getCell(columns.get(header)).value]));
  if (Object.values(values).some((value) => !blank(value))) rows.push({ index, ...values });
 });
 return rows;
}

async function readProducts(client) {
 const products = await Array.fromAsync(client.listAll('products', { limit: 100 }));
 return {
  ids: new Set(products.map(({ id }) => id)),
  bySlug: new Set(products.map(({ slug, locale }) => slugKey(slug, locale))),
 };
}

async function readTrashSlugs(read) {
 const slugs = new Set(), cursors = new Set();
 let cursor;
 do {
  const query = new URLSearchParams({ limit: '100' });
  if (cursor) query.set('cursor', cursor);
  const page = await read(`content/products/trash?${query}`);
  for (const { slug, locale } of page.items) slugs.add(slugKey(slug, locale));
  cursor = page.nextCursor;
  if (cursor && cursors.has(cursor)) throw new Error('Repeated cursor while reading product Trash.');
  cursors.add(cursor);
 } while (cursor);
 return slugs;
}

async function readLookups(client) {
 const lookups = {};
 for (const { collection } of referenceFields) {
  const titles = new Map();
  for await (const { id } of client.listAll(collection, { limit: 100 })) {
   const entry = await client.get(collection, id, { raw: true });
   titles.set(id, entry.data.title);
  }
  lookups[collection] = titles;
 }
 return lookups;
}

function checkFields(row, current, lookups) {
 const errors = [], changes = [];
 function change(field, before, after) {
  if ((before ?? null) !== after) changes.push({ field, before, after });
 }

 for (const [header, field] of [['Title', 'title'], ['Summary', 'summary']]) {
  const value = row[header];
  if (blank(value)) {
   if (header === 'Title' && !current) errors.push('Title is required.');
  } else if (typeof value !== 'string') {
   errors.push(`${header} must be text.`);
  } else {
   change(header, current?.data[field], value);
  }
 }

 const price = row['Price (EUR)'];
 if (blank(price)) {
  if (!current) errors.push('Price (EUR) is required.');
 } else {
  const cents = typeof price === 'number' ? Math.round(price * 100) : NaN;
  if (!Number.isSafeInteger(cents) || cents < 0 || cents / 100 !== price) {
   errors.push('Price (EUR) must be a nonnegative number with at most two decimal places.');
  } else {
   const previous = current?.data.price_cents;
   change('Price (EUR)', previous == null ? null : previous / 100, price);
  }
 }

 for (const { header, field, collection } of referenceFields) {
  const name = row[header];
  if (blank(name)) continue;
  const titles = lookups[collection];
  const [selected] = current?.references?.[field]?.children ?? [];
  const previous = selected && (titles.get(selected.id) ?? selected.title);
  if (name === previous) continue;
  const matches = [...titles.values()].filter((title) => title === name);
  if (typeof name !== 'string' || matches.length !== 1) {
   errors.push(`${header} must match exactly one EmDash title.`);
  } else {
   change(header, previous, name);
  }
 }
 return { errors, changes };
}

async function preview(client, read, rows) {
 const products = await readProducts(client);
 const trashSlugs = rows.some(({ ID }) => blank(ID)) ? await readTrashSlugs(read) : new Set();
 const lookups = await readLookups(client);
 const duplicates = Map.groupBy(rows, rowKey);
 const totals = { Creates: 0, Updates: 0, Unchanged: 0, Errors: 0 };
 for (const row of rows) {
  const { ID, Slug, Locale, Revision } = row;
  const existing = !blank(ID);
  let current;
  const errors = [];
  if (duplicates.get(rowKey(row)).length > 1) errors.push('This product appears more than once in the workbook.');
  if (existing) {
   if (!products.ids.has(ID)) {
    errors.push('ID does not match a current EmDash product.');
   } else {
    current = await client.get('products', ID, { raw: true });
    if ((Slug ?? null) !== current.slug || (Locale ?? null) !== current.locale) errors.push('Slug and locale must match the exported product.');
    if (blank(Revision) || Revision !== current._rev) errors.push('Revision is missing or stale. Export the current product and reapply your edits.');
   }
  } else {
   if (typeof Slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(Slug)) {
    errors.push('A new product needs a lowercase slug with letters, digits, or hyphens.');
   }
   if (Locale !== seed.defaultLocale) errors.push(`A new product needs locale "${seed.defaultLocale}".`);
   if (!blank(Revision)) errors.push('Clear the Revision for a new product.');
   const key = slugKey(Slug, Locale);
   if (products.bySlug.has(key)) errors.push('A product already has this slug and locale. Use its exported ID and revision.');
   if (trashSlugs.has(key)) errors.push('A product in Trash still reserves this slug and locale.');
  }
  const fields = checkFields(row, current, lookups);
  errors.push(...fields.errors);
  if (errors.length) {
   totals.Errors++;
   console.log(`Row ${row.index} [error] ${errors.join(' ')}`);
   continue;
  }
  if (existing && !fields.changes.length) {
   totals.Unchanged++;
   continue;
  }
  totals[existing ? 'Updates' : 'Creates']++;
  const changes = fields.changes.map(({ field, before, after }) => existing
   ? `${field} ${JSON.stringify(before ?? null)} → ${JSON.stringify(after)}`
   : `${field} ${JSON.stringify(after)}`);
  console.log(`Row ${row.index} [${existing ? 'update' : 'create'}] ${JSON.stringify(Slug)}: ${changes.join(', ')}`);
 }
 console.log(Object.entries(totals).map(([key, value]) => `${key}: ${value}`).join(' | '));
 if (totals.Errors) process.exitCode = 1;
}

let token;
async function main() {
 const { values } = parseArgs({ options: {
  url: { type: 'string' }, input: { type: 'string' }, help: { type: 'boolean' },
 } });
 if (values.help) {
  console.log(usage);
  return;
 }
 if (!values.url || !values.input?.toLowerCase().endsWith('.xlsx')) throw new Error(usage);
 const rows = await readRows(values.input);
 token = await readCatalogToken();
 const { client, read } = await connectCatalog(values.url, token);
 console.log(`Products import preview (read-only). Fields checked: ${editable.join(', ')}.`);
 await preview(client, read, rows);
}

main().catch((error) => {
 console.error(token ? error.message.replaceAll(token, '[redacted]') : error.message);
 process.exitCode = 1;
});
