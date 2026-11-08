import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
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
 const script = fileURLToPath(new URL('../scripts/cms/export-catalog.mjs', import.meta.url));
 const published = [{ image: { id: 'media-1' }, alt: 'Original' }];
 const draft = [{ image: { id: 'media-2' }, alt: 'Edited', focal_x: 0.4 }];
 const collection = { id: 'col-1', slug: 'margarita', locale: 'es', data: { title: 'Margarita', code: 'MARG' } };
 const product = {
  id: 'p-1', slug: 'tierra', locale: 'es', status: 'published', draftRevisionId: 'revision-1',
  data: { title: 'Tierra', price_cents: 5900, gallery: draft },
  liveData: { gallery: published },
  references: { collection: { children: [{ id: collection.id, title: 'Previous published title' }] } },
 };
 const seen = [];
 let denyDrafts = false;
 const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  seen.push([req.method, url.pathname, url.searchParams.get('cursor'), req.headers.authorization]);
  const route = url.pathname.split('/').slice(4).join('/');
  if (route === 'products/trash' && denyDrafts) {
   res.writeHead(403);
   res.end();
   return;
  }
  const responses = {
   'products/trash': { items: [] },
   products: url.searchParams.has('cursor') ? { items: [{ id: 'p-2' }] } : { items: [{ id: 'p-1' }], nextCursor: 'page-2' },
   'products/p-1': { item: product, _rev: 'revision-token' },
   'products/p-2': { item: { id: 'p-2', status: 'draft', data: { title: 'New', gallery: [] } } },
   collections: { items: [{ id: 'col-1' }] },
   'collections/col-1': { item: collection },
  };
  res.writeHead(responses[route] ? 200 : 404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ success: Boolean(responses[route]), data: responses[route] }));
 });
 server.listen(0, '127.0.0.1');
 await once(server, 'listening');
 t.after(() => new Promise((resolve) => server.close(resolve)));
 async function runExport(output) {
  const env = { ...process.env };
  delete env.EMDASH_TOKEN;
  const child = spawn(process.execPath, [script, '--url', `http://127.0.0.1:${server.address().port}`, '--output', output], {
   cwd: folder,
   env,
   stdio: ['ignore', 'ignore', 'pipe'],
  });
  let stderr = '';
  child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
  const [code] = await once(child, 'close');
  return { code, stderr };
 }
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
 assert.equal(seen.length, 7);
 assert(seen.every(([method, , , auth]) => method === 'GET' && auth === 'Bearer fixture-token'));
 assert(seen.some(([, path, cursor]) => path.endsWith('/products') && cursor === 'page-2'));

 const workbook = new ExcelJS.Workbook();
 await workbook.xlsx.readFile(output);
 assert.deepEqual(workbook.worksheets.map(({ name }) => name), ['Products', 'Collections']);
 const products = workbook.getWorksheet('Products');
 const columns = Object.fromEntries(products.getRow(1).values.slice(1).map((name, index) => [name, index + 1]));
 assert.equal(products.getCell(2, columns.ID).value, 'p-1');
 assert.equal(products.getCell(2, columns.Revision).value, 'revision-token');
 assert.equal(products.getCell(2, columns['Price (EUR)']).value, 59);
 const relation = products.getCell(2, columns.Collection);
 assert.equal(relation.value, 'Margarita');
 assert.equal(relation.dataValidation.type, 'list');
 assert.deepEqual(relation.dataValidation.formulae, ['INDIRECT("CatalogCollections[Title]")']);
 assert.deepEqual(JSON.parse(products.getCell(2, columns.Gallery).value), { published, draft });
 assert.deepEqual(JSON.parse(products.getCell(3, columns.Gallery).value), { draft: [] });
 assert.equal(workbook.getWorksheet('Collections').getCell('A2').value, 'col-1');
 assert(workbook.getWorksheet('Collections').getTable('CatalogCollections'));
});
