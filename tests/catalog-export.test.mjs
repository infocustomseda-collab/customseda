import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';

test('catalog export paginates, preserves gallery versions and links a collection dropdown', async (t) => {
 const folder = await mkdtemp(join(tmpdir(), 'seda-export-'));
 t.after(() => rm(folder, { recursive: true, force: true }));
 await writeFile(join(folder, '.env'), 'EMDASH_TOKEN="fixture-token"\n');
 const exportScript = fileURLToPath(new URL('../scripts/cms/export-catalog.mjs', import.meta.url));
 const previewScript = fileURLToPath(new URL('../scripts/cms/import-catalog.mjs', import.meta.url));
 const published = [{ image: { id: 'media-1' }, alt: 'Original' }];
 const draft = [{ image: { id: 'media-2' }, alt: 'Edited', focal_x: 0.4 }];
 const collection = { id: 'col-1', slug: 'margarita', locale: 'es', data: { title: 'Margarita', code: 'MARG' } };
 const term = { id: 'cat-top', label: 'Top', slug: 'top', locale: 'es' };
 const size = { id: 'size-s', slug: 'top-s', locale: 'es', data: { title: 'S · Top', label: 'S', sort_order: 1 } };
 const otherSize = { ...size, id: 'size-s-en', locale: 'en' };
 const color = { id: 'color-1', slug: 'azul', data: { title: 'Azul', hex: '#112233' } };
 const guide = { id: 'guide-1', slug: 'tops', data: { title: 'Guide' } };
 const material = {
  id: 'mat-1', data: { title: 'Lycra', special_edition: 1 },
  references: {
   color: { children: [{ id: color.id, title: 'Previous color title' }] },
   sizes: { children: [{ id: size.id, title: size.data.title }] },
  },
 };
 const component = { id: 'p-2', slug: 'new', locale: 'es', status: 'draft', data: { title: 'New', gallery: [] } };
 const otherComponent = { id: 'p-3', slug: 'second', locale: 'es', status: 'draft', data: { title: 'Second' } };
 const product = {
  id: 'p-1', slug: 'tierra', locale: 'es', status: 'published', draftRevisionId: 'revision-1',
  data: { title: 'Tierra', price_cents: 5900, bundle: 1, gallery: draft },
  liveData: { gallery: published },
  references: {
   collection: { children: [{ id: collection.id, title: 'Previous published title' }] },
   material: { children: [{ id: material.id, title: 'Previous material title' }] },
   size_guide: { children: [{ id: guide.id, title: guide.data.title }] },
   components: { children: [{ id: otherComponent.id, title: otherComponent.data.title }], nextCursor: 'more-components' },
  },
 };
 const seen = [], writes = [];
 let denyDrafts = false, failWrite;
 const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  seen.push([req.method, url.pathname, url.searchParams.get('cursor'), req.headers.authorization]);
  if (req.method === 'PUT' || req.method === 'POST') {
   let body = '';
   for await (const chunk of req) body += chunk;
   writes.push({ path: url.pathname, body: JSON.parse(body) });
   if (url.pathname === failWrite) {
    res.writeHead(409, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: { message: 'Fixture revision conflict' } }));
    return;
   }
   const resource = url.pathname.split('/').at(-1);
   const data = resource === 'terms' ? { term: { id: 'new-term' } }
    : { item: { id: req.method === 'POST' ? `new-${resource}` : resource } };
   res.writeHead(200, { 'Content-Type': 'application/json' });
   res.end(JSON.stringify({ success: true, data }));
   return;
  }
  const [, , , resource, ...parts] = url.pathname.split('/');
  const route = resource === 'content' ? parts.join('/') : [resource, ...parts].join('/');
  if (route === 'products/trash' && denyDrafts) {
   res.writeHead(403);
   res.end();
   return;
  }
  const responses = {
   'taxonomies/category/terms': { terms: [{ id: 'cat-w', label: 'Mujeres', slug: 'mujeres', children: [term] }] },
   'products/p-1/terms/category': { terms: [term] },
   'products/new-products/terms/category': { terms: [] },
   'materials/trash': { items: [] },
   'colors/trash': { items: [] },
   'products/p-2/terms/category': { terms: [] },
   'products/p-3/terms/category': { terms: [] },
   'sizes/size-s/terms/category': { terms: [term] },
   'sizes/size-s-en/terms/category': { terms: [term] },
   'sizes/size-s-en/references/materials_sizes/parents': { parents: [{ id: 'live-material' }] },
   'products/p-1/references/products_components/children': {
    children: url.searchParams.get('cursor') === 'more-components' ? [{ id: component.id, title: component.data.title }] : [],
   },
   materials: { items: [{ id: material.id }] },
   'materials/mat-1': { item: material, _rev: 'material-rev' },
   colors: { items: [{ id: color.id }] },
   'colors/color-1': { item: color, _rev: 'color-rev' },
   sizes: { items: [{ id: size.id }, { id: otherSize.id }] },
   'sizes/size-s': { item: size },
   'sizes/size-s-en': { item: otherSize, _rev: 'size-en-rev' },
   size_guides: { items: [{ id: guide.id }] },
   'size_guides/guide-1': { item: guide },
   'products/trash': { items: [{ id: 'trashed', slug: 'reserved', locale: 'es' }] },
   products: url.searchParams.has('cursor') ? { items: [{ id: 'p-2' }, { id: 'p-3' }] } : { items: [{ id: 'p-1' }], nextCursor: 'page-2' },
   'products/p-1': { item: product, _rev: 'revision-token' },
   'products/p-2': { item: component, _rev: 'rev-2' },
   'products/p-3': { item: otherComponent, _rev: 'rev-3' },
   collections: { items: [{ id: 'col-1' }] },
   'collections/col-1': { item: collection },
  };
  res.writeHead(responses[route] ? 200 : 404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ success: Boolean(responses[route]), data: responses[route] }));
 });
 server.listen(0, '127.0.0.1');
 await once(server, 'listening');
 t.after(() => new Promise((resolve) => server.close(resolve)));
 async function runCommand(script, ...args) {
  const env = { ...process.env };
  delete env.EMDASH_TOKEN;
  const child = spawn(process.execPath, [script, '--url', `http://127.0.0.1:${server.address().port}`, ...args], {
   cwd: folder,
   env,
   stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '', stderr = '';
  child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
  child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
  const [code] = await once(child, 'close');
  return { code, stdout, stderr };
 }
 const runExport = (output, ...args) => runCommand(exportScript, '--output', output, ...args);
 const deniedOutput = join(folder, 'denied.xlsx');
 denyDrafts = true;
 const denied = await runExport(deniedOutput);
 assert.equal(denied.code, 1);
 assert.match(denied.stderr, /draft read access/);
 await assert.rejects(access(deniedOutput), { code: 'ENOENT' });

 denyDrafts = false;
 seen.length = 0;
 const output = join(folder, 'catalog.xlsx');
 const result = await runExport(output);
 assert.equal(result.code, 0, result.stderr);
 assert(seen.every(([method, , , auth]) => method === 'GET' && auth === 'Bearer fixture-token'));
 assert(seen.some(([, path, cursor]) => path.endsWith('/products') && cursor === 'page-2'));

 await writeFile(output, 'existing workbook');
 const existing = await runExport(output);
 assert.equal(existing.code, 1);
 assert.match(existing.stderr, /--overwrite/);
 assert.equal(await readFile(output, 'utf8'), 'existing workbook');

 denyDrafts = true;
 const failedOverwrite = await runExport(output, '--overwrite');
 assert.equal(failedOverwrite.code, 1);
 assert.match(failedOverwrite.stderr, /draft read access/);
 assert.equal(await readFile(output, 'utf8'), 'existing workbook');

 denyDrafts = false;
 const overwrite = await runExport(output, '--overwrite');
 assert.equal(overwrite.code, 0, overwrite.stderr);

 const workbook = new ExcelJS.Workbook();
 await workbook.xlsx.readFile(output);
 assert.deepEqual(workbook.worksheets.map(({ name }) => name), [
  'Products', 'Collections', 'Materials', 'Colors', 'Sizes', 'Categories',
  'Bundle Components', 'Material Sizes', 'Size Guides',
 ]);
 const products = workbook.getWorksheet('Products');
 const columns = Object.fromEntries(products.getRow(1).values.slice(1).map((name, index) => [name, index + 1]));
 assert.equal(products.getCell(2, columns.ID).value, 'p-1');
 assert.equal(products.getCell(2, columns.Revision).value, 'revision-token');
 assert.equal(products.getCell(2, columns['Price (EUR)']).value, 59);
 const relation = products.getCell(2, columns.Collection);
 assert.equal(relation.value, 'Margarita');
 assert.equal(relation.dataValidation.type, 'list');
 assert.deepEqual(relation.dataValidation.formulae, ['CatalogCollectionTitles']);
 assert.deepEqual(workbook.definedNames.getRanges('CatalogCollectionTitles').ranges, ['Collections!$F$2']);
 assert.equal(workbook.getWorksheet('Collections').getCell('F2').value, 'Margarita');
 assert.deepEqual(JSON.parse(products.getCell(2, columns.Gallery).value), { published, draft });
 assert.deepEqual(JSON.parse(products.getCell(3, columns.Gallery).value), { draft: [] });
 assert.equal(workbook.getWorksheet('Collections').getCell('A2').value, 'col-1');
 assert(workbook.getWorksheet('Collections').getTable('CatalogCollections'));

 function check(sheetName, header, value, source, row = 2) {
  const sheet = workbook.getWorksheet(sheetName);
  const column = sheet.getRow(1).values.indexOf(header);
  assert(column > 0, `${sheetName} has a ${header} column`);
  const cell = sheet.getCell(row, column);
  assert.equal(cell.value, value);
  if (source) {
   assert.equal(cell.dataValidation.type, 'list');
   assert.deepEqual(cell.dataValidation.formulae, [source]);
   assert(workbook.definedNames.getRanges(source).ranges.length > 0);
  }
 }

 check('Products', 'Bundle', true);
 check('Products', 'Material', 'Lycra', 'CatalogMaterialTitles');
 check('Products', 'Size Guide', 'Guide', 'CatalogSizeGuideTitles');
 check('Products', 'Category', 'Mujeres → Top', 'CatalogCategoryPaths');
 check('Materials', 'ID', material.id);
 check('Materials', 'Color', 'Azul', 'CatalogColorTitles');
 check('Materials', 'Special Edition', true);
 check('Colors', 'Hex', '#112233');
 check('Sizes', 'ID', size.id);
 check('Sizes', 'Label', 'S');
 check('Sizes', 'Category', 'Mujeres → Top', 'CatalogCategoryPaths');
 check('Categories', 'ID', term.id, null, 3);
 check('Categories', 'Path', 'Mujeres → Top', null, 3);
 check('Categories', 'Parent', 'Mujeres', 'CatalogCategoryPaths', 3);
 check('Bundle Components', 'Bundle', 'Tierra', 'CatalogProductTitles');
 check('Bundle Components', 'Component', 'Second', 'CatalogProductTitles');
 check('Bundle Components', 'Position', 2, null, 3);
 check('Bundle Components', 'Component', 'New', 'CatalogProductTitles', 3);
 check('Material Sizes', 'Material', 'Lycra', 'CatalogMaterialTitles');
 check('Sizes', 'Reference Name', 'S · Top (es)');
 check('Sizes', 'Reference Name', 'S · Top (en)', null, 3);
 check('Material Sizes', 'Size', 'S · Top (es)', 'CatalogSizeTitles');

 seen.length = 0;
 const untouched = await runCommand(previewScript, 'preview', '--input', output);
 assert.equal(untouched.code, 0, untouched.stderr);
 assert.match(untouched.stdout, /Creates: 0.*Updates: 0.*Unchanged: 10.*Errors: 0/);
 assert(seen.length > 0 && seen.every(([method]) => method === 'GET'));

 products.getCell(2, columns['Price (EUR)']).value = 61.25;
 products.getCell(3, columns.Revision).value = 'old-revision';
 products.getCell(3, columns.Title).value = 'Would overwrite a newer edit';
 products.getCell(4, columns.Collection).value = 'Unknown collection';
 products.getCell(4, columns['Price (EUR)']).value = 21.005;
 products.getCell(5, columns.Slug).value = 'new-bikini';
 products.getCell(5, columns.Locale).value = 'es';
 products.getCell(5, columns.Title).value = 'New Bikini';
 products.getCell(5, columns['Price (EUR)']).value = 80;
 products.getCell(5, columns.Collection).value = 'Margarita';
 products.getCell(6, columns.Slug).value = 'reserved';
 products.getCell(6, columns.Locale).value = 'es';
 products.getCell(6, columns.Title).value = 'Reserved';
 products.getCell(6, columns['Price (EUR)']).value = 80;
 products.getCell(7, columns.Slug).value = 'missing-collection';
 products.getCell(7, columns.Locale).value = 'es';
 products.getCell(7, columns.Title).value = 'Missing collection';
 products.getCell(7, columns['Price (EUR)']).value = 80;
 const edited = join(folder, 'edited.xlsx');
 await workbook.xlsx.writeFile(edited);
 seen.length = 0;
 const preview = await runCommand(previewScript, 'preview', '--input', edited);
 assert.equal(preview.code, 1, preview.stderr);
 assert.match(preview.stdout, /Creates: 1.*Updates: 1.*Unchanged: 7.*Errors: 4/);
 assert.match(preview.stdout, /Row 2.*Price \(EUR\).*59.*61\.25/);
 assert.match(preview.stdout, /Row 3.*[Rr]evision/);
 assert.match(preview.stdout, /Row 4.*Price.*Collection/);
 assert.match(preview.stdout, /Row 5.*new-bikini/);
 assert.match(preview.stdout, /Row 6.*Trash/);
 assert.match(preview.stdout, /Row 7.*Collection.*required/);
 assert(seen.length > 0 && seen.every(([method]) => method === 'GET'));

 const applyBook = new ExcelJS.Workbook();
 await applyBook.xlsx.readFile(output);
 applyBook.getWorksheet('Products').getCell(2, columns.Title).value = 'Revised title';
 applyBook.getWorksheet('Products').getCell(2, columns.Description).value =
  JSON.stringify([{ _type: 'block', _key: 'paragraph', children: [] }]);
 applyBook.getWorksheet('Colors').getCell('G2').value = '#445566';
 applyBook.getWorksheet('Products').getCell(2, columns.Gallery).value = 'Edited backup column';
 const applyPath = join(folder, 'apply.xlsx');
 await applyBook.xlsx.writeFile(applyPath);
 const proposed = await runCommand(previewScript, 'preview', '--input', applyPath);
 assert.equal(proposed.code, 0, proposed.stderr);
 assert.match(proposed.stdout, /Updates: 2/);
 const digest = proposed.stdout.match(/Plan: (sha256:[a-f0-9]{64})/)?.[1];
 assert(digest);

 seen.length = 0;
 const rejected = await runCommand(previewScript, 'apply', '--input', applyPath, '--confirm', 'sha256:wrong');
 assert.equal(rejected.code, 1);
 assert(seen.every(([method]) => method === 'GET'));
 const applied = await runCommand(previewScript, 'apply', '--input', applyPath, '--confirm', digest);
 assert.equal(applied.code, 0, applied.stderr);
 assert.deepEqual(writes, [
  { path: '/_emdash/api/content/colors/color-1', body: { data: { hex: '#445566' }, _rev: 'color-rev' } },
  { path: '/_emdash/api/content/products/p-1', body: {
   data: { title: 'Revised title', description: [{ _type: 'block', _key: 'paragraph', children: [] }] },
   _rev: 'revision-token',
  } },
 ]);

 writes.length = 0;
 failWrite = '/_emdash/api/content/products/p-1';
 const partial = await runCommand(previewScript, 'apply', '--input', applyPath, '--confirm', digest);
 assert.equal(partial.code, 1);
 assert.match(partial.stderr, /Stopped after 1 confirmed writes.*Fixture revision conflict/);
 assert.match(partial.stdout, /Applied Colors row 2/);
 failWrite = undefined;

 writes.length = 0;
 const staleTaxonomy = new ExcelJS.Workbook();
 await staleTaxonomy.xlsx.readFile(output);
 const categoryTab = staleTaxonomy.getWorksheet('Categories');
 categoryTab.getCell('D3').value = 'Edited category';
 const termRevision = categoryTab.getRow(1).values.indexOf('Revision');
 categoryTab.getCell(1, termRevision > 0 ? termRevision : 8).value = 'Revision';
 categoryTab.getCell(3, termRevision > 0 ? termRevision : 8).value = 'stale-term';
 const productTab = staleTaxonomy.getWorksheet('Products');
 productTab.getCell(2, columns.Category).value = 'Mujeres';
 const assignmentRevision = productTab.getRow(1).values.indexOf('Category Revision');
 productTab.getCell(1, assignmentRevision > 0 ? assignmentRevision : 16).value = 'Category Revision';
 productTab.getCell(2, assignmentRevision > 0 ? assignmentRevision : 16).value = 'stale-assignment';
 const stalePath = join(folder, 'stale-taxonomy.xlsx');
 await staleTaxonomy.xlsx.writeFile(stalePath);
 const stale = await runCommand(previewScript, 'preview', '--input', stalePath);
 assert.equal(stale.code, 1);
 assert.match(stale.stdout, /Categories row 3.*Category revision.*stale/);
 assert.match(stale.stdout, /Row 2.*Category assignment revision.*stale/);
 assert.equal(writes.length, 0);

 const blockedBook = new ExcelJS.Workbook();
 await blockedBook.xlsx.readFile(output);
 const blockedProducts = blockedBook.getWorksheet('Products');
 blockedProducts.getCell(2, columns.Category).value = 'Mujeres';
 blockedProducts.getCell(2, columns.Material).value = 'New material';
 const blockedMaterials = blockedBook.getWorksheet('Materials');
 blockedMaterials.getCell('B3').value = 'new-material';
 blockedMaterials.getCell('C3').value = 'es';
 blockedMaterials.getCell('F3').value = 'New material';
 blockedBook.getWorksheet('Sizes').getCell('I3').value = 'Mujeres';
 const blockedPath = join(folder, 'blocked.xlsx');
 await blockedBook.xlsx.writeFile(blockedPath);
 const blocked = await runCommand(previewScript, 'preview', '--input', blockedPath);
 assert.equal(blocked.code, 1);
 assert.match(blocked.stdout, /Row 2.*material: publica primero/);
 assert.match(blocked.stdout, /Sizes row 3.*live references/);
 assert.equal(writes.length, 0);

 const expanded = new ExcelJS.Workbook();
 await expanded.xlsx.readFile(output);
 function setRow(sheetName, index, values) {
  const sheet = expanded.getWorksheet(sheetName);
  for (const [name, value] of Object.entries(values)) {
   const column = sheet.getRow(1).values.indexOf(name);
   assert(column > 0, `${sheetName} has a ${name} column`);
   sheet.getCell(index, column).value = value;
  }
 }
 setRow('Categories', 4, { Slug: 'extra', Locale: 'es', Name: 'Extra', Parent: 'Mujeres' });
 setRow('Colors', 3, { Slug: 'green', Locale: 'es', Title: 'Green', Hex: '#227733' });
 setRow('Materials', 3, { Slug: 'green-material', Locale: 'es', Title: 'Green material', Color: 'Green' });
 setRow('Material Sizes', 2, { Size: null, Position: null });
 setRow('Products', 5, {
  Slug: 'green-product', Locale: 'es', Title: 'Green product', 'Price (EUR)': 50,
  Collection: 'Margarita', Material: 'Green material', Category: 'Mujeres → Extra',
 });
 const expandedPath = join(folder, 'expanded.xlsx');
 await expanded.xlsx.writeFile(expandedPath);
 const expandedPlan = await runCommand(previewScript, 'preview', '--input', expandedPath);
 assert.equal(expandedPlan.code, 0, expandedPlan.stderr);
 assert.match(expandedPlan.stdout, /Creates: 4.*Updates: 1/);
 const expandedDigest = expandedPlan.stdout.match(/Plan: (sha256:[a-f0-9]{64})/)?.[1];
 assert(expandedDigest);
 const withoutTaxonomy = await runCommand(previewScript, 'apply', '--input', expandedPath, '--confirm', expandedDigest);
 assert.equal(withoutTaxonomy.code, 1);
 assert.match(withoutTaxonomy.stderr, /--allow-taxonomy/);
 assert.equal(writes.length, 0);
 const withTaxonomy = await runCommand(previewScript, 'apply', '--input', expandedPath, '--confirm', expandedDigest, '--allow-taxonomy');
 assert.equal(withTaxonomy.code, 0, withTaxonomy.stderr);
 assert.deepEqual(writes, [
  { path: '/_emdash/api/taxonomies/category/terms', body: { label: 'Extra', parentId: 'cat-w', slug: 'extra', locale: 'es' } },
  { path: '/_emdash/api/content/colors', body: { data: { title: 'Green', hex: '#227733' }, slug: 'green', locale: 'es', status: 'draft' } },
  { path: '/_emdash/api/content/materials/mat-1', body: { references: { sizes: [] }, _rev: 'material-rev' } },
  { path: '/_emdash/api/content/materials', body: { data: { title: 'Green material' }, references: { color: ['new-colors'] },
   slug: 'green-material', locale: 'es', status: 'draft' } },
  { path: '/_emdash/api/content/products', body: { data: { title: 'Green product', price_cents: 5000 },
   references: { collection: ['col-1'], material: ['new-materials'] }, slug: 'green-product', locale: 'es', status: 'draft' } },
  { path: '/_emdash/api/content/products/new-products/terms/category', body: { termIds: ['new-term'] } },
 ]);
});
