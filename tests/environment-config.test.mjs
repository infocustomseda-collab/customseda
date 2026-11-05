import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {checkEnvironment,assertEnvironment} from '../scripts/config/check-env.mjs';

async function fixture(t,files) {
 const root=await mkdtemp(join(tmpdir(),'customseda-env-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 for(const [name,source] of Object.entries(files))await writeFile(join(root,name),source);
 return root;
}

test('keys can be distributed across files, with exports, comments and multiline values',async t=>{
 const root=await fixture(t,{
  '.env.example':'ONE=\nTWO=\nTHREE=\n# OPTIONAL=\n',
  '.env':'export ONE="private-value" # comment\n',
  '.env.cloudflare-production':'TWO="line one\nline two"\n',
  '.env.cloudflare-staging':'THREE=\nONE=duplicate-is-fine\n',
 });
 const result=await assertEnvironment(root);
 assert.deepEqual(result.missing,[]);
 assert.deepEqual(result.undocumented,[]);
 assert.equal(result.count,3);
 assert.equal(result.files.length,3);
 assert.doesNotMatch(JSON.stringify(result),/private-value|line one|duplicate-is-fine/);
});

test('the example, comments, backups and shell variables cannot satisfy a missing key',async t=>{
 const root=await fixture(t,{
  '.env.example':'SHELL_ONLY=\nCOMMENT_ONLY=\nBACKUP_ONLY=\n',
  '.env':'# COMMENT_ONLY=private\n',
  '.env.cloudflare-production.before-format':'BACKUP_ONLY=private\n',
 });
 const script=fileURLToPath(new URL('../scripts/config/check-env.mjs',import.meta.url));
 const result=spawnSync(process.execPath,[script],{cwd:root,encoding:'utf8',env:{...process.env,SHELL_ONLY:'do-not-print'}});
 assert.equal(result.status,1);
 for(const key of ['SHELL_ONLY','COMMENT_ONLY','BACKUP_ONLY'])assert.ok(result.stderr.includes(key));
 assert.doesNotMatch(result.stderr+result.stdout,/do-not-print|private/);
});

test('a new environment key must be active in the example and errors never show its value',async t=>{
 const root=await fixture(t,{
  '.env.example':'KNOWN=\n# NEW_SECRET=\n',
  '.env.cloudflare-production':'KNOWN=private-known\nNEW_SECRET=private-new\n',
 });
 assert.deepEqual((await checkEnvironment(root)).undocumented,['NEW_SECRET']);
 await assert.rejects(assertEnvironment(root),error=>{
  assert.match(error.message,/NEW_SECRET/);
  assert.doesNotMatch(error.message,/private-known|private-new/);
  return true;
 });
});

test('missing and empty examples fail without reading or printing secret values',async t=>{
 const root=await fixture(t,{});
 await assert.rejects(assertEnvironment(root),/No se puede leer .env.example/);
 await writeFile(join(root,'.env.example'),'# ONLY_COMMENTS=\n');
 await assert.rejects(assertEnvironment(root),/ninguna clave activa/);
});

test('remote dev checks environment keys before reading Wrangler or starting Astro',async t=>{
 const root=await fixture(t,{'.env.example':'NEEDED=\n'});
 const script=fileURLToPath(new URL('../scripts/dev/remote.mjs',import.meta.url));
 const result=spawnSync(process.execPath,[script,'production'],{cwd:root,encoding:'utf8'});
 assert.equal(result.status,1);
 assert.match(result.stderr,/Faltan claves.*NEEDED/);
 assert.doesNotMatch(result.stderr,/wrangler|ENOENT|Local execution/);
});
