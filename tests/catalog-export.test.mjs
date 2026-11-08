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
 const previewScript = fileURLToPath(new URL('../scripts/cms/preview-product-import.mjs', import.meta.url));
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
 const seen = [];
 let denyDrafts = false;
 const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  seen.push([req.method, url.pathname, url.searchParams.get('cursor'), req.headers.authorization]);
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
   'products/p-2/terms/category': { terms: [] },
   'products/p-3/terms/category': { terms: [] },
   'sizes/size-s/terms/category': { terms: [term] },
   'sizes/size-s-en/terms/category': { terms: [term] },
   'products/p-1/references/products_components/children': {
    children: url.searchParams.get('cursor') === 'more-components' ? [{ id: component.id, title: component.data.title }] : [],
   },
   materials: { items: [{ id: material.id }] },
   'materials/mat-1': { item: material },
   colors: { items: [{ id: color.id }] },
   'colors/color-1': { item: color },
   sizes: { items: [{ id: size.id }, { id: otherSize.id }] },
   'sizes/size-s': { item: size },
   'sizes/size-s-en': { item: otherSize },
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
 const untouched = await runCommand(previewScript, '--input', output);
 assert.equal(untouched.code, 0, untouched.stderr);
 assert.match(untouched.stdout, /Creates: 0.*Updates: 0.*Unchanged: 3.*Errors: 0/);
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
 const edited = join(folder, 'edited.xlsx');
 await workbook.xlsx.writeFile(edited);
 seen.length = 0;
 const preview = await runCommand(previewScript, '--input', edited);
 assert.equal(preview.code, 1, preview.stderr);
 assert.match(preview.stdout, /Creates: 1.*Updates: 1.*Unchanged: 0.*Errors: 3/);
 assert.match(preview.stdout, /Row 2.*Price \(EUR\).*59.*61\.25/);
 assert.match(preview.stdout, /Row 3.*[Rr]evision/);
 assert.match(preview.stdout, /Row 4.*Price.*Collection/);
 assert.match(preview.stdout, /Row 5.*new-bikini/);
 assert.match(preview.stdout, /Row 6.*Trash/);
 assert(seen.length > 0 && seen.every(([method]) => method === 'GET'));
});
