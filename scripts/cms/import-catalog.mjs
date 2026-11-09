import { createHash } from 'node:crypto';
import { isDeepStrictEqual, parseArgs } from 'node:util';
import { connectCatalog, readCatalog, readCatalogToken, readTrashSlugs } from './catalog-api.mjs';
import { planCatalogImport, readImportWorkbook } from './catalog-import-plan.mjs';

const usage = 'Usage: pnpm catalog:import:preview --url <origin> --input <file.xlsx>\n'
 + '       pnpm catalog:import:apply --url <origin> --input <file.xlsx> --confirm <Plan> [--allow-taxonomy]';
const quote = (value) => JSON.stringify(value);
const changed = (row) => !row.current || row.changes.length > 0;
const at = (row) => `${row.sheet} row ${row.index}`;
const segment = encodeURIComponent;
const termPath = 'taxonomies/category/terms';

function actionRows(rows) {
 const categories = rows.filter(({ type }) => type === 'category').sort((a, b) => a.depth - b.depth);
 const entries = rows.filter(({ type }) => type !== 'category');
 const bundles = new Set(entries.filter((row) => {
  const value = row.data.bundle ?? row.current?.data.bundle;
  return row.type === 'products' && (value === true || value === 1);
 }));
 return [...categories, ...entries.filter((row) => !bundles.has(row)), ...bundles];
}

function operations(rows) {
 return actionRows(rows.filter((row) => !row.errors.length && changed(row))).map((row) => ({
  type: row.type, key: row.key, at: at(row),
  slug: row.cells.Slug, locale: row.cells.Locale,
  id: row.current?.id, rev: row.current?._rev,
  data: row.data, refs: row.refs, category: row.category, parent: row.parent,
  beforeTerm: row.current && row.type === 'category' ? {
   id: row.current.id, label: row.current.termLabel,
   description: row.current.description ?? null, parentId: row.current.parentId ?? null,
  } : undefined,
 }));
}

function report({ rows, selections }) {
 const totals = { Creates: 0, Updates: 0, Unchanged: 0, Errors: 0 };
 for (const row of [...rows, ...selections.filter((item) => item.errors.length)]) {
  const prefix = row.sheet === 'Products' ? `Row ${row.index} (Products)` : at(row);
  if (row.errors.length) {
   totals.Errors++;
   console.log(`${prefix} [error] ${row.errors.join(' ')}`);
  } else if (!changed(row)) {
   totals.Unchanged++;
  } else {
   totals[row.current ? 'Updates' : 'Creates']++;
   const changes = row.changes.map(([field, before, after]) => row.current
    ? `${field} ${quote(before)} → ${quote(after)}` : `${field} ${quote(after)}`);
   console.log(`${prefix} [${row.current ? 'update' : 'create'}] ${quote(row.cells.Slug)}: ${changes.join(', ')}`);
  }
 }
 console.log(Object.entries(totals).map(([key, value]) => `${key}: ${value}`).join(' | '));
 return totals.Errors;
}

async function checkLiveDependents(rows, read) {
 for (const row of rows) {
  if (!row.current || row.errors.length) continue;
  let relation, reason;
  if (row.type === 'collections' && Object.hasOwn(row.data, 'code')) {
   relation = 'products_collection';
   reason = 'The code of a collection with live references cannot be changed.';
  } else if (row.type === 'sizes' && row.category) {
   relation = 'materials_sizes';
   reason = 'The category of a size with live references cannot be changed.';
  } else if (row.type === 'products' && row.data.bundle === true) {
   relation = 'products_components';
   reason = 'A product selected as a live component cannot become a bundle.';
  }
  if (!relation) continue;
  const { parents } = await read(`content/${row.type}/${segment(row.current.id)}/references/${relation}/parents?limit=1`);
  if (parents.length) row.errors.push(reason);
 }
}

async function applyOperations(connection, plan) {
 const ids = new Map();
 function idFor(key) {
  const id = ids.get(key) ?? key;
  if (!id || id.startsWith('new:')) throw new Error('A required entry was not created yet.');
  return id;
 }
 let writes = 0;
 try {
  for (const op of plan) {
   if (op.type === 'category') {
    const body = { ...op.data, ...(op.parent ? { parentId: idFor(op.parent) } : {}) };
    let result;
    if (op.id) {
     const path = `${termPath}/${segment(op.slug)}?${new URLSearchParams({ locale: op.locale })}`;
     const { term } = await connection.read(path);
     const latest = { id: term.id, label: term.label, description: term.description ?? null, parentId: term.parentId ?? null };
     if (!isDeepStrictEqual(latest, op.beforeTerm)) throw new Error(`${op.at}: category changed after preview.`);
     result = await connection.write('PUT', path, body);
    } else {
     result = await connection.write('POST', termPath, { ...body, slug: op.slug, locale: op.locale });
    }
    writes++;
    ids.set(op.key, result.term.id);
    console.log(`Applied ${op.at} (${result.term.id}, taxonomy).`);
    continue;
   }

   const base = `content/${op.type}`;
   let id = op.id;
   let expectedRev = op.rev;
   if (!id || Object.keys(op.data).length || Object.keys(op.refs).length) {
    const body = {};
    if (!id || Object.keys(op.data).length) body.data = op.data;
    if (Object.keys(op.refs).length) {
     body.references = Object.fromEntries(Object.entries(op.refs).map(([field, keys]) => [field, keys.map(idFor)]));
    }
    const result = id
     ? await connection.write('PUT', `${base}/${segment(id)}`, { ...body, _rev: op.rev })
     : await connection.write('POST', base, { ...body, slug: op.slug, locale: op.locale, status: 'draft' });
    writes++;
    id = result.item.id;
    expectedRev = result._rev ?? result.item._rev;
    ids.set(op.key, id);
    console.log(`Applied ${op.at} (${id}, draft content).`);
   }
   if (op.category) {
    if (op.id) {
     const latest = await connection.client.get(op.type, id, { raw: true });
     if (!expectedRev || latest._rev !== expectedRev) throw new Error(`${op.at}: content changed before the category assignment.`);
    }
    const path = `${base}/${segment(id)}/terms/category`;
    const { terms, unresolved } = await connection.read(path);
    if (unresolved?.length || terms.length > 1 || (terms[0]?.id ?? null) !== op.category.before) {
     throw new Error(`${op.at}: category assignment changed after preview.`);
    }
    await connection.write('POST', path, { termIds: [idFor(op.category.after)] });
    writes++;
    console.log(`Applied ${op.at} (${id}, category assignment).`);
   }
  }
 } catch (error) {
  throw new Error(`Stopped after ${writes} confirmed writes. Check the reported IDs and EmDash before retrying. ${error.message}`);
 }
 console.log(`Completed ${writes} API writes.`);
}

let token;
async function main() {
 const { values, positionals } = parseArgs({ allowPositionals: true, options: {
  url: { type: 'string' }, input: { type: 'string' }, confirm: { type: 'string' },
  'allow-taxonomy': { type: 'boolean' }, help: { type: 'boolean' },
 } });
 if (values.help) return console.log(usage);
 const [mode] = positionals;
 if (positionals.length !== 1 || !['preview', 'apply'].includes(mode) || !values.url
  || !values.input?.toLowerCase().endsWith('.xlsx')) throw new Error(usage);
 if (mode === 'apply' && !values.confirm) throw new Error('Run preview first and pass its Plan value with --confirm.');
 const workbook = await readImportWorkbook(values.input);
 token = await readCatalogToken();
 const connection = await connectCatalog(values.url, token);
 const catalog = await readCatalog(connection);
 const trash = {};
 for (const { type, cells } of workbook.entities) {
  if (!cells.ID && !trash[type]) trash[type] = await readTrashSlugs(connection.read, type);
 }
 const result = planCatalogImport(workbook, catalog, trash);
 await checkLiveDependents(result.rows, connection.read);
 const errors = report(result);
 if (errors) {
  process.exitCode = 1;
  return;
 }
 const plan = operations(result.rows);
 if (!plan.length) return;
 const taxonomy = plan.some((op) => op.type === 'category' || op.category);
 if (taxonomy) console.log('Taxonomy changes take effect immediately and require --allow-taxonomy.');
 const digest = `sha256:${createHash('sha256').update(JSON.stringify([connection.origin, plan])).digest('hex')}`;
 console.log(`Plan: ${digest}`);
 if (mode === 'preview') return;
 if (values.confirm !== digest) throw new Error('The plan changed. Run preview again before applying.');
 if (taxonomy && !values['allow-taxonomy']) throw new Error('Pass --allow-taxonomy to apply immediate taxonomy changes.');
 await applyOperations(connection, plan);
}

main().catch((error) => {
 console.error(token ? error.message.replaceAll(token, '[redacted]') : error.message);
 process.exitCode = 1;
});
