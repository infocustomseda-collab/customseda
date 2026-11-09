import { isDeepStrictEqual } from 'node:util';
import ExcelJS from 'exceljs';
import seed from '../../seed/seed.json' with { type: 'json' };
import { validateCatalogEntry } from '../../src/lib/cms/catalog.ts';
import { categoryAssignmentRevision, categoryRevision, flattenCategories, sizeReferenceNames } from './catalog-workbook.mjs';

const sheets = {
 Colors: { type: 'colors', fields: { Hex: ['hex', 'hex'] } },
 Collections: { type: 'collections', fields: { Code: ['code', 'text', true], Description: ['description', 'rich text'] } },
 Sizes: { type: 'sizes', fields: { Label: ['label', 'text', true], Order: ['sort_order', 'integer'] }, category: true },
 Materials: { type: 'materials', fields: { 'Special Edition': ['special_edition', 'boolean'] }, refs: { Color: ['color', 'colors'] } },
 Products: {
  type: 'products',
  fields: { Summary: ['summary', 'text'], 'Price (EUR)': ['price_cents', 'price', true], Bundle: ['bundle', 'boolean'], Description: ['description', 'rich text'] },
  refs: { Collection: ['collection', 'collections'], Material: ['material', 'materials'], 'Size Guide': ['size_guide', 'size_guides'] },
  category: true,
 },
};
const links = {
 'Bundle Components': { owner: 'Bundle', target: 'Component', from: 'products', to: 'products', field: 'components' },
 'Material Sizes': { owner: 'Material', target: 'Size', from: 'materials', to: 'sizes', field: 'sizes' },
};
const identityHeaders = ['ID', 'Slug', 'Locale'];
const blank = (value) => value == null || (typeof value === 'string' && value.trim() === '');
const own = (object, key) => Object.hasOwn(object, key);
const booleanValue = (value) => value === 0 || value === 1 ? Boolean(value) : value;
export const slugKey = (slug, locale) => JSON.stringify([slug, locale]);

function sheetRows(workbook, name, headers, optional = false, metadata = []) {
 const sheet = workbook.getWorksheet(name);
 if (!sheet && optional) return [];
 if (!sheet) throw new Error(`The workbook must contain a ${name} sheet.`);
 const columns = new Map();
 const accepted = [...headers, ...metadata];
 sheet.getRow(1).eachCell((cell, index) => {
  if (!accepted.includes(cell.value)) return;
  if (columns.has(cell.value)) throw new Error(`${name} has more than one "${cell.value}" column.`);
  columns.set(cell.value, index);
 });
 const missing = headers.filter((header) => !columns.has(header));
 if (missing.length) throw new Error(`Missing ${name} columns: ${missing.join(', ')}.`);
 const rows = [];
 sheet.eachRow((row, index) => {
  if (index === 1) return;
  const cells = Object.fromEntries(accepted.map((header) => [header, columns.has(header) ? row.getCell(columns.get(header)).value : null]));
  if (Object.values(cells).some((value) => !blank(value))) rows.push({ sheet: name, index, cells, errors: [] });
 });
 return rows;
}

export async function readImportWorkbook(path) {
 const workbook = new ExcelJS.Workbook();
 await workbook.xlsx.readFile(path);
 const entities = Object.entries(sheets).flatMap(([name, config]) =>
  sheetRows(workbook, name, [...identityHeaders, 'Revision', 'Title', ...Object.keys(config.fields),
   ...Object.keys(config.refs ?? {}), ...(config.category ? ['Category'] : [])], name !== 'Products',
  config.category ? ['Category Revision'] : [])
   .map((row) => ({ ...row, config, type: config.type })));
 const categories = sheetRows(workbook, 'Categories', [...identityHeaders, 'Name', 'Path', 'Parent', 'Description'], true, ['Revision'])
  .map((row) => ({ ...row, type: 'category' }));
 const selections = Object.entries(links).flatMap(([name, config]) =>
  sheetRows(workbook, name, [config.owner, config.target, 'Position'], true).map((row) => ({ ...row, config })));
 return { entities, categories, selections };
}

function parseField(value, kind) {
 switch (kind) {
  case 'text': if (typeof value === 'string') return value; break;
  case 'hex': if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)) return value; break;
  case 'integer': if (Number.isSafeInteger(value)) return value; break;
  case 'boolean': if (typeof booleanValue(value) === 'boolean') return booleanValue(value); break;
  case 'price': {
   const cents = typeof value === 'number' ? Math.round(value * 100) : NaN;
   if (Number.isSafeInteger(cents) && cents >= 0 && cents / 100 === value) return cents;
   break;
  }
  case 'rich text': {
   const parsed = typeof value === 'string' ? JSON.parse(value) : null;
   if (parsed === null && typeof value === 'string' && value.trim() === 'null') return null;
   if (Array.isArray(parsed) && parsed.every((block) => typeof block?._type === 'string')) return parsed;
   break;
  }
 }
 throw new Error('Invalid field value.');
}

function recordField(row, header, field, kind, required, before, target) {
 const cell = row.cells[header];
 if (blank(cell)) {
  if (required && !row.current) row.errors.push(`${header} is required.`);
  return;
 }
 let value;
 try { value = parseField(cell, kind); }
 catch {
  const format = kind === 'price' ? 'a nonnegative number with at most two decimal places'
   : kind === 'rich text' ? 'a Portable Text JSON array' : `valid ${kind}`;
  row.errors.push(`${header} must be ${format}.`);
  return;
 }
 if (kind === 'rich text' && value === null) return;
 const old = kind === 'boolean' ? booleanValue(before) : before;
 if (!isDeepStrictEqual(old, value)) {
  target[field] = value;
  row.changes.push([header, kind === 'price' && old != null ? old / 100 : old ?? null, kind === 'price' ? cell : value]);
 }
}

function currentRecords(catalog) {
 const records = new Map();
 for (const [type, entries] of Object.entries(catalog)) {
  if (type === 'categories') continue;
  for (const entry of entries) {
   const refs = Object.fromEntries(Object.entries(entry.references ?? {}).map(([field, { children }]) =>
    [field, children.map(({ id }) => id)]));
   records.set(entry.id, { ...entry, key: entry.id, type, group: entry.translationGroup ?? entry.id,
    liveBundle: booleanValue((entry.liveData ?? entry.data).bundle), refs });
  }
 }
 for (const term of flattenCategories(catalog.categories)) {
  records.set(term.id, { ...term, termLabel: term.label, type: 'category', key: term.id, group: term.translationGroup ?? term.id, status: 'published' });
 }
 return records;
}

function bindRows(rows, records, trash) {
 const occupied = new Map([...records.values()].map(({ type, slug, locale, id }) => [`${type}:${slugKey(slug, locale)}`, id]));
 const byKey = new Map();
 for (const row of rows) {
  const { ID, Slug, Locale, Revision } = row.cells;
  row.changes = [];
  row.data = {};
  row.refs = {};
  const existing = !blank(ID);
  const slug = slugKey(Slug, Locale);
  row.key = existing ? ID : `new:${row.type}:${slug}`;
  if (byKey.has(row.key)) {
   row.errors.push('This entry appears more than once in the workbook.');
   byKey.get(row.key).errors.push('This entry appears more than once in the workbook.');
  }
  byKey.set(row.key, row);
  if (existing) {
   const current = records.get(ID);
   if (!current || current.type !== row.type) row.errors.push('ID does not match a current EmDash entry.');
   else {
    row.current = current;
    if ((Slug ?? null) !== (current.slug ?? null) || (Locale ?? null) !== (current.locale ?? null)) {
     row.errors.push('Slug and locale must match the exported entry.');
    }
   }
  } else {
   if (typeof Slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(Slug)) {
    row.errors.push('A new entry needs a lowercase slug with letters, digits, or hyphens.');
   }
   if (Locale !== seed.defaultLocale) row.errors.push(`A new entry needs locale "${seed.defaultLocale}".`);
   if (!blank(Revision)) row.errors.push('Clear the Revision for a new entry.');
   if (occupied.has(`${row.type}:${slug}`)) row.errors.push('An entry already has this slug and locale. Use its exported ID.');
   if (trash[row.type]?.has(slug)) row.errors.push('An entry in Trash still reserves this slug and locale.');
  }
 }
 return byKey;
}

function indexAliases(records) {
 const aliases = new Map();
 for (const entry of records.values()) {
  for (const label of entry.aliases) {
   if (blank(label)) continue;
   const key = JSON.stringify([entry.type, label]);
   const matches = aliases.get(key) ?? new Set();
   matches.add(entry.key);
   aliases.set(key, matches);
  }
 }
 return aliases;
}

function resolve(aliases, type, name, row, header, previous) {
 const matches = aliases.get(JSON.stringify([type, name]));
 if (previous && matches?.has(previous)) return previous;
 if (typeof name !== 'string' || matches?.size !== 1) {
  row.errors.push(`${header} must match exactly one EmDash title or path.`);
  return undefined;
 }
 return matches.values().next().value;
}

function categoryDepth(records, entry, seen = new Set()) {
 if (seen.has(entry.key)) throw new Error('Category parents form a cycle.');
 if (!entry.parentKey) return 0;
 const parent = records.get(entry.parentKey);
 if (!parent) throw new Error('Category parent is missing.');
 return 1 + categoryDepth(records, parent, new Set([...seen, entry.key]));
}

function compareRefs(row, field, header, keys, records) {
 const previous = row.current?.refs[field] ?? [];
 const identities = (ids) => ids.map((id) => records.get(id)?.group ?? id);
 if (isDeepStrictEqual(identities(previous), identities(keys))) return;
 row.refs[field] = keys;
 const names = (ids) => ids.map((id) => records.get(id)?.label ?? id);
 row.changes.push([header, names(previous), names(keys)]);
}

function planSelections(rows, aliases, records, byKey) {
 const groups = new Map();
 for (const row of rows) {
  const { owner, target, from, to, field } = row.config;
  const ownerKey = resolve(aliases, from, row.cells[owner], row, owner);
  if (!ownerKey) continue;
  const parent = byKey.get(ownerKey);
  if (!parent) {
   row.errors.push(`Include the matching ${from} row and revision before editing links.`);
   continue;
  }
  const empty = blank(row.cells[target]) && blank(row.cells.Position);
  const targetKey = empty ? null : resolve(aliases, to, row.cells[target], row, target);
  const position = row.cells.Position;
  if (!empty && (!Number.isSafeInteger(position) || position < 1)) row.errors.push('Position must be a positive whole number.');
  if (row.errors.length) continue;
  const key = JSON.stringify([ownerKey, field]);
  const group = groups.get(key) ?? { parent, field, sheet: row.sheet, items: [] };
  group.items.push({ key: targetKey, position });
  groups.set(key, group);
 }
 for (const { parent, field, sheet, items } of groups.values()) {
  if (items.length === 1 && items[0].key === null) {
   compareRefs(parent, field, sheet, [], records);
   continue;
  }
  const targets = items.map(({ key }) => records.get(key)?.group ?? key);
  if (targets.includes(null) || new Set(targets).size !== items.length || new Set(items.map(({ position }) => position)).size !== items.length) {
   parent.errors.push(`${sheet} needs distinct choices and positions, or one blank selection to clear it.`);
   continue;
  }
  const ordered = items.sort((a, b) => a.position - b.position).map(({ key }) => key);
  compareRefs(parent, field, sheet, ordered, records);
 }
}

export function planCatalogImport(workbook, catalog, trash = {}) {
 const { entities, categories, selections } = workbook;
 const rows = [...categories, ...entities];
 const records = currentRecords(catalog);
 const byKey = bindRows(rows, records, trash);
 const sizeNames = sizeReferenceNames(catalog.sizes);
 for (const record of records.values()) {
  record.label = record.type === 'category' ? record.path : sizeNames.get(record.id) ?? record.data.title;
  record.aliases = [record.label];
 }
 for (const row of rows) {
  if (row.errors.length) continue;
  row.plannable = true;
  if (row.type === 'category') {
   recordField(row, 'Name', 'label', 'text', true, row.current?.termLabel, row.data);
   recordField(row, 'Description', 'description', 'text', false, row.current?.description, row.data);
   const label = row.data.label ?? row.current?.termLabel;
   const parent = blank(row.cells.Parent) ? row.current?.parent : row.cells.Parent;
   const path = parent ? `${parent} → ${label}` : label;
   records.set(row.key, { ...row.current, key: row.key, group: row.current?.group ?? row.key,
    type: row.type, status: 'published', parentKey: row.current?.parentKey, label: path,
    aliases: [row.current?.path, path] });
  } else {
   for (const [header, [field, kind, required]] of Object.entries({ Title: ['title', 'text', true], ...row.config.fields })) {
    recordField(row, header, field, kind, required, row.current?.data[field], row.data);
   }
   const data = { ...row.current?.data, ...row.data };
   for (const field of ['bundle', 'special_edition']) if (own(data, field)) data[field] = booleanValue(data[field]);
   const label = row.data.title ?? row.current?.label ?? data.title;
   records.set(row.key, { ...row.current, key: row.key, group: row.current?.group ?? row.key,
    type: row.type, status: row.current?.status ?? 'draft', label, data,
    aliases: [row.current?.label, label], refs: { ...row.current?.refs } });
  }
 }
 const aliases = indexAliases(records);
 for (const row of categories) {
  if (row.errors.length || blank(row.cells.Parent)) continue;
  const before = row.current?.parentKey;
  const parent = resolve(aliases, 'category', row.cells.Parent, row, 'Parent', before);
  if (parent && parent !== before) {
   records.get(row.key).parentKey = parent;
   row.parent = parent;
   row.changes.push(['Parent', row.current?.parent ?? null, row.cells.Parent]);
  }
 }
 for (const row of categories) {
  if (row.errors.length) continue;
  if (row.current && row.changes.length && row.cells.Revision !== categoryRevision({ ...row.current, label: row.current.termLabel })) {
   row.errors.push('Category revision is missing or stale. Export the current category and reapply your edits.');
  }
  try { row.depth = categoryDepth(records, records.get(row.key)); }
  catch (error) { row.errors.push(error.message); }
 }

 for (const row of entities) {
  if (!row.plannable) continue;
  for (const [header, [field, type]] of Object.entries(row.config.refs ?? {})) {
   const name = row.cells[header];
   if (blank(name)) continue;
   const key = resolve(aliases, type, name, row, header, row.current?.refs[field]?.[0]);
   if (key) compareRefs(row, field, header, [key], records);
  }
  if (row.config.category && !blank(row.cells.Category)) {
   const before = row.current?.categoryId ?? null;
   const key = resolve(aliases, 'category', row.cells.Category, row, 'Category', before);
   if (key && records.get(key).group !== (records.get(before)?.group ?? before)) {
    if (row.current && row.cells['Category Revision'] !== categoryAssignmentRevision(row.current)) {
     row.errors.push('Category assignment revision is missing or stale. Export the current entry and reapply your edits.');
    }
    row.category = { before, after: key };
    row.changes.push(['Category', records.get(before)?.label ?? null, records.get(key).label]);
   }
  }
 }
 planSelections(selections, aliases, records, byKey);
 const categoryEdits = Map.groupBy(categories.filter((row) => row.current && row.changes.length), (row) => row.current.group);
 for (const edits of categoryEdits.values()) {
  if (edits.length > 1 && edits.some((row) => row.parent)) {
   for (const row of edits) row.errors.push('Edit the shared parent and translated category names in separate plans.');
  }
 }
 const assignments = Map.groupBy(entities.filter((row) => row.category), (row) => records.get(row.key).group);
 for (const edits of assignments.values()) {
  const targets = new Set(edits.map((row) => records.get(row.category.after).group));
  if (targets.size > 1) {
   for (const row of edits) row.errors.push('Translations specify different categories for the same entry.');
   continue;
  }
  for (const row of edits.slice(1)) {
   row.category = undefined;
   row.changes = row.changes.filter(([header]) => header !== 'Category');
  }
 }

 const graph = new Map(), liveGraph = new Map();
 for (const entry of records.values()) {
  const row = byKey.get(entry.key);
  const category = row?.category?.after ?? entry.categoryId;
  const node = { id: entry.key, type: entry.type, status: entry.status, data: entry.data ?? {},
   refs: { ...entry.refs, ...row?.refs, ...(category ? { category: [category] } : {}) } };
  graph.set(entry.key, node);
  liveGraph.set(entry.key, { ...node, data: { ...(entry.liveData ?? row?.current?.data ?? entry.data) },
   refs: entry.refs ?? {} });
 }
 const referencesSizeOrEntry = (entries, field, key) => {
  const group = records.get(key)?.group ?? key;
  return [...entries.values()].some(({ refs }) => refs?.[field]?.some((id) => (records.get(id)?.group ?? id) === group));
 };
 const inUse = (field, key) => referencesSizeOrEntry(records, field, key) || referencesSizeOrEntry(graph, field, key);
 for (const row of entities) {
  if (row.errors.length || (row.current && !row.changes.length)) continue;
  const entry = graph.get(row.key);
  if (row.current && (!row.cells.Revision || row.cells.Revision !== row.current._rev)) {
   row.errors.push('Revision is missing or stale. Export the current entry and reapply your edits.');
  }
  const publish = Boolean(row.category && row.current?.status === 'published');
  const validation = validateCatalogEntry(entry, publish ? liveGraph : graph, { publish });
  row.errors.push(...validation.map((error) => error === 'collection: selecciona exactamente una opción.'
   ? 'Collection is required for individual products.' : error));
  if (row.type === 'sizes' && row.current && row.category && inUse('sizes', row.key)) {
   row.errors.push('The category of a size in use cannot be changed.');
  }
  if (row.type === 'collections' && row.current && own(row.data, 'code') && inUse('collection', row.key)) {
   row.errors.push('The code of a collection in use cannot be changed.');
  }
  if (row.type === 'products' && row.current && row.data.bundle === true && inUse('components', row.key)) {
   row.errors.push('A product selected as a component cannot become a bundle.');
  }
  if (entry.data.bundle === true && entry.refs.components?.some((id) => records.get(id)?.liveBundle === true)) {
   row.errors.push('A component is still a bundle in EmDash. Complete that change before selecting it as a component.');
  }
  if (publish && entry.data.bundle === true && entry.refs.components?.some((id) => records.get(id)?.draftRevisionId)) {
   row.errors.push('Resolve pending component drafts in EmDash before changing a published bundle category.');
  }
 }
 return { rows, selections };
}
