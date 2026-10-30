// Maintenance fallback for EmDash 1.3.1 exports that exceed Worker CPU while hashing media.
// Uses the installed native export route unchanged, with the source's remote D1/R2 bindings.
import { openBindings } from '../build/bindings.mjs';
import { readFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';

// The adapter's factory imports Worker env. Only its R2Storage class is used here,
// with an explicit remote binding; fail if any code tries to use the factory env.
const hook = registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'cloudflare:workers') return { url: 'data:text/javascript,export const env = new Proxy({}, {get(){throw new Error("Use explicit remote bindings in the maintenance runtime")}})', shortCircuit: true };
  return next(specifier, context);
} });
const { R2Storage } = await import('@emdash-cms/cloudflare/storage/r2');
hook.deregister();

const [environment, operationId, mode] = process.argv.slice(2);
if (environment !== 'staging' || !/^[0-9A-HJKMNP-TV-Z]{26}$/.test(operationId ?? '')) throw new Error('Usage: node scripts/cms/advance-local-export.mjs staging <export-operation-id>');
const root = new URL('../../node_modules/emdash/', import.meta.url);
const pkg = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
if (pkg.version !== '1.3.1') throw new Error('Recheck the native transfer API before using this fallback with another EmDash version.');
const { POST } = await import(new URL('dist/astro/routes/api/admin/transfer/exports/_id_/advance.mjs', root));
const bindings = await openBindings(environment);
try {
  const user = await bindings.db.selectFrom('users').selectAll().where('role', '>=', 50).executeTakeFirstOrThrow();
  const operation = await bindings.db.selectFrom('_emdash_transfer_operations').select(['id', 'kind', 'created_by']).where('id', '=', operationId).executeTakeFirstOrThrow();
  if (operation.kind !== 'export' || operation.created_by !== user.id) throw new Error('Expected an existing export created by this source administrator.');
  const storage = new R2Storage(bindings.media);
  if (mode === '--probe') {
    const key=`_emdash_transfer/local-probe/${crypto.randomUUID()}`;
    try {
      const bytes=new TextEncoder().encode('local-export-storage-probe');
      await storage.upload({key,contentType:'application/octet-stream',body:new ReadableStream({start(c){c.enqueue(bytes);c.close();}})});
      console.log('Stream upload probe passed.');
    } catch(error) {
      for(let cause=error;cause;cause=cause.cause)console.error(cause.message);
      process.exitCode=1;
    } finally {await storage.delete(key);}
  } else {
  for (;;) {
    const response = await POST({ params: { id: operationId }, locals: { user, emdash: { db: bindings.db, storage } } });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(JSON.stringify(result.error));
    const { operation, nextRequestInMs } = result.data;
    console.log(JSON.stringify({ state: operation.state, stage: operation.stage, progress: operation.progress }));
    if (nextRequestInMs === null) {
      if (operation.state !== 'complete') throw new Error(`Export ended in ${operation.state}`);
      break;
    }
    if (nextRequestInMs > 0) await new Promise(resolve => setTimeout(resolve, Math.max(nextRequestInMs, 5000)));
  }
  }
} finally { await bindings.dispose(); }
