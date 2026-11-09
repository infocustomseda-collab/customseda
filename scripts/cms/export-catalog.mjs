import { mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { connectCatalog, readCatalog, readCatalogToken } from './catalog-api.mjs';
import { makeCatalogWorkbook } from './catalog-workbook.mjs';

const usage = 'Usage: pnpm catalog:export --url <EmDash origin> --output <file.xlsx> [--overwrite] (EMDASH_TOKEN in .env)';
let token;

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
 token = await readCatalogToken();
 const catalog = await readCatalog(await connectCatalog(values.url, token));
 await saveWorkbook(makeCatalogWorkbook(catalog), values.output, values.overwrite);
 console.log(`Exported ${catalog.products.length} products and their catalog lookups to ${values.output}.`);
}

main().catch((error) => {
 console.error(token ? error.message.replaceAll(token, '[redacted]') : error.message);
 process.exitCode = 1;
});
