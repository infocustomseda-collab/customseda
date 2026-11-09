import { createHash } from 'node:crypto';
import ExcelJS from 'exceljs';

const revision = (values) => createHash('sha256').update(JSON.stringify(values)).digest('hex');
export const categoryRevision = (term) => revision([term.id, term.label, term.parentId ?? null, term.description ?? null]);
export const categoryAssignmentRevision = (entry) => revision([entry.id, entry.categoryId ?? null]);

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

function booleanCell(value) {
 return value === 0 || value === 1 ? Boolean(value) : value;
}

function baseRow(entry) {
 return [entry.id, entry.slug, entry.locale, entry.status, entry._rev, entry.data.title];
}

const baseColumns = [
 { header: 'ID', width: 30 }, { header: 'Slug', width: 26 }, { header: 'Locale', width: 11 },
 { header: 'Status', width: 14 }, { header: 'Revision', width: 30 }, { header: 'Title', width: 28 },
];

const ranges = {
 Products: 'CatalogProductTitles',
 Collections: 'CatalogCollectionTitles',
 Materials: 'CatalogMaterialTitles',
 Colors: 'CatalogColorTitles',
 Sizes: 'CatalogSizeTitles',
 Categories: 'CatalogCategoryPaths',
 'Size Guides': 'CatalogSizeGuideTitles',
};

function addSheet(workbook, name, columns, rows, { table, source = 'Title' } = {}) {
 const sheet = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
 sheet.columns = columns.map(({ header, width }) => ({ header, key: header, width }));
 if (table) {
  sheet.addTable({
   name: table,
   ref: 'A1',
   columns: columns.map(({ header }) => ({ name: header, filterButton: true })),
   rows: rows.length ? rows : [[]],
  });
 } else {
  sheet.addRows(rows);
  sheet.getRow(1).font = { bold: true };
  sheet.autoFilter = { from: 'A1', to: { row: 1, column: columns.length } };
 }

 if (ranges[name]) {
  const letter = sheet.getColumn(source).letter;
  const lastRow = Math.max(2, rows.length + 1);
  workbook.definedNames.add(`'${name}'!$${letter}$2:$${letter}$${lastRow}`, ranges[name]);
 }
 return sheet;
}

function dropdown(sheet, header, source) {
 const letter = sheet.getColumn(header).letter;
 sheet.dataValidations.add(`${letter}2:${letter}${Math.max(1000, sheet.rowCount)}`, {
  type: 'list',
  allowBlank: true,
  showErrorMessage: true,
  errorStyle: 'stop',
  errorTitle: `Unknown ${header.toLowerCase()}`,
  error: 'Choose a value from the list.',
  formulae: [ranges[source]],
 });
}

export function flattenCategories(terms, parent = '', parentKey = null) {
 return terms.flatMap((term) => {
  const path = parent ? `${parent} → ${term.label}` : term.label;
  return [{ ...term, path, parent, parentKey }, ...flattenCategories(term.children ?? [], path, term.id)];
 });
}

function titlesById(entries) {
 return new Map(entries.map(({ id, data }) => [id, data.title]));
}

export function sizeReferenceNames(sizes) {
 const byTitle = Map.groupBy(sizes, ({ data }) => data.title);
 return new Map(sizes.map(({ id, slug, locale, data: { title } }) => {
  const matches = byTitle.get(title);
  if (matches.length === 1) return [id, title];
  const language = locale ?? 'default';
  const qualifier = matches.filter((size) => size.locale === locale).length > 1
   ? `${language}: ${slug ?? id}` : language;
  return [id, `${title} (${qualifier})`];
 }));
}

function referenceTitles(entry, field, titles) {
 return (entry.references?.[field]?.children ?? []).map(({ id, title }) => titles.get(id) ?? title);
}

export function makeCatalogWorkbook({ products, collections, materials, colors, sizes, categories, size_guides }) {
 const workbook = new ExcelJS.Workbook();
 const categoryRows = flattenCategories(categories);
 const pathsById = new Map(categoryRows.map(({ id, path }) => [id, path]));
 function categoryPath(entry) {
  if (!entry.categoryId) return null;
  const path = pathsById.get(entry.categoryId);
  if (!path) throw new Error(`Category ${entry.categoryId} on entry ${entry.id} is missing from the taxonomy export.`);
  return path;
 }

 const collectionTitles = titlesById(collections);
 const materialTitles = titlesById(materials);
 const colorTitles = titlesById(colors);
 const guideTitles = titlesById(size_guides);
 const productTitles = titlesById(products);
 const sizeTitles = sizeReferenceNames(sizes);

 const productSheet = addSheet(workbook, 'Products', [...baseColumns,
  { header: 'Summary', width: 36 }, { header: 'Price (EUR)', width: 15 }, { header: 'Collection', width: 26 },
  { header: 'Material', width: 26 }, { header: 'Size Guide', width: 26 }, { header: 'Bundle', width: 12 },
  { header: 'Description', width: 38 }, { header: 'Gallery', width: 38 }, { header: 'Category', width: 28 },
  { header: 'Category Revision', width: 26 },
 ], products.map((entry) => {
  const { id, data } = entry;
  return [...baseRow(entry), data.summary, data.price_cents == null ? null : data.price_cents / 100,
   referenceTitles(entry, 'collection', collectionTitles)[0],
   referenceTitles(entry, 'material', materialTitles)[0],
   referenceTitles(entry, 'size_guide', guideTitles)[0],
   booleanCell(data.bundle), jsonCell(data.description, 'Description', id), galleryBackup(entry), categoryPath(entry),
   categoryAssignmentRevision(entry)];
 }));
 productSheet.getColumn('Price (EUR)').numFmt = '0.00';
 productSheet.getColumn('Category Revision').hidden = true;

 addSheet(workbook, 'Collections', [...baseColumns, { header: 'Code', width: 18 },
  { header: 'Description', width: 38 }, { header: 'Image', width: 38 }],
 collections.map((entry) => [...baseRow(entry), entry.data.code,
  jsonCell(entry.data.description, 'Description', entry.id), jsonCell(entry.data.image, 'Image', entry.id)]),
 { table: 'CatalogCollections' });

 const materialSheet = addSheet(workbook, 'Materials', [...baseColumns,
  { header: 'Color', width: 24 }, { header: 'Special Edition', width: 16 }],
 materials.map((entry) => [...baseRow(entry),
  referenceTitles(entry, 'color', colorTitles)[0], booleanCell(entry.data.special_edition)]));

 addSheet(workbook, 'Colors', [...baseColumns, { header: 'Hex', width: 14 }],
 colors.map((entry) => [...baseRow(entry), entry.data.hex]));

 const sizeSheet = addSheet(workbook, 'Sizes', [...baseColumns, { header: 'Label', width: 12 },
  { header: 'Order', width: 12 }, { header: 'Category', width: 28 }, { header: 'Reference Name', width: 30 },
  { header: 'Category Revision', width: 26 }],
 sizes.map((entry) => [...baseRow(entry), entry.data.label, entry.data.sort_order, categoryPath(entry), sizeTitles.get(entry.id),
  categoryAssignmentRevision(entry)]),
 { source: 'Reference Name' });
 sizeSheet.getColumn('Category Revision').hidden = true;

 const categorySheet = addSheet(workbook, 'Categories', [
  { header: 'ID', width: 30 }, { header: 'Slug', width: 26 }, { header: 'Locale', width: 11 },
  { header: 'Name', width: 24 }, { header: 'Path', width: 32 }, { header: 'Parent', width: 28 },
  { header: 'Description', width: 38 }, { header: 'Revision', width: 26 },
 ], categoryRows.map((term) =>
  [term.id, term.slug, term.locale, term.label, term.path, term.parent || null, term.description, categoryRevision(term)]),
 { source: 'Path' });
 categorySheet.getColumn('Revision').hidden = true;

 const componentSheet = addSheet(workbook, 'Bundle Components', [
  { header: 'Bundle', width: 30 }, { header: 'Component', width: 30 }, { header: 'Position', width: 12 },
 ], products.flatMap((entry) => referenceTitles(entry, 'components', productTitles).map((component, index) =>
  [entry.data.title, component, index + 1])));

 const availabilitySheet = addSheet(workbook, 'Material Sizes', [
  { header: 'Material', width: 30 }, { header: 'Size', width: 24 }, { header: 'Position', width: 12 },
 ], materials.flatMap((entry) => referenceTitles(entry, 'sizes', sizeTitles).map((size, index) =>
  [entry.data.title, size, index + 1])));

 addSheet(workbook, 'Size Guides', baseColumns, size_guides.map(baseRow));

 dropdown(productSheet, 'Collection', 'Collections');
 dropdown(productSheet, 'Material', 'Materials');
 dropdown(productSheet, 'Size Guide', 'Size Guides');
 dropdown(productSheet, 'Category', 'Categories');
 dropdown(materialSheet, 'Color', 'Colors');
 dropdown(sizeSheet, 'Category', 'Categories');
 dropdown(categorySheet, 'Parent', 'Categories');
 dropdown(componentSheet, 'Bundle', 'Products');
 dropdown(componentSheet, 'Component', 'Products');
 dropdown(availabilitySheet, 'Material', 'Materials');
 dropdown(availabilitySheet, 'Size', 'Sizes');
 return workbook;
}
