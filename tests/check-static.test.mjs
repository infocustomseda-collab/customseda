import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {checkStaticBuild} from '../scripts/build/check-static.mjs';

async function site(t,pages) {
 const dir=await mkdtemp(join(tmpdir(),'customseda-static-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 for(const [path,html] of Object.entries(pages)) {await mkdir(join(dir,path,'..'),{recursive:true});await writeFile(join(dir,path),html);}
 return dir;
}
const page=body=>`<!doctype html><html lang="es"><head><title>Seda</title></head><body>${body}</body></html>`;

test('a build whose pages are EmDash error responses is refused',async t=>{
 const dir=await site(t,{'index.html':'Database migrations are required. Apply the deployment migration manifest and retry.','404.html':page('No encontramos esta página')});
 await assert.rejects(()=>checkStaticBuild(dir),/index\.html/);
});

test('a page without a document shell is refused; real pages pass',async t=>{
 await assert.rejects(async()=>checkStaticBuild(await site(t,{'index.html':'Internal error','404.html':page('x')})),/index\.html/);
 assert.deepEqual(await checkStaticBuild(await site(t,{'index.html':page('Inicio'),'products/fuego.html':page('Fuego'),'404.html':page('x')})),{pages:3});
});

test('the homepage and 404 must exist',async t=>{
 await assert.rejects(async()=>checkStaticBuild(await site(t,{'404.html':page('x')})),/index\.html/);
});
