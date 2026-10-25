import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,readdir,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Kysely} from 'kysely';
import {createDialect} from 'emdash/db/sqlite';
import {runMigrations} from 'emdash/db';
import sharp from 'sharp';
import {buildImages} from '../scripts/build/images.mjs';
import {writeSnapshot} from '../scripts/build/snapshot.mjs';
import {applyModelMigrations} from '../src/lib/cms/model-migration.ts';
import {imageView} from '../src/lib/shop/view.ts';

async function workspace(t) {
 const dir=await mkdtemp(join(tmpdir(),'customseda-build-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 return dir;
}
const media=(key,width=800,height=600)=>({id:`m-${key}`,provider:'local',width,height,meta:{storageKey:key}});
// An R2-like bucket over a Map; get() returns null for missing keys, as R2 does.
const bucket=objects=>({get:async key=>objects.has(key)?{arrayBuffer:async()=>objects.get(key)}:null});

test('the images step keeps the original URL for missing or undecodable originals and annotates the rest',async t=>{
 const dir=await workspace(t);
 const snapshotPath=join(dir,'snapshot.json');
 const good=await sharp({create:{width:1200,height:900,channels:3,background:'#c08060'}}).jpeg().toBuffer();
 await writeFile(snapshotPath,JSON.stringify({version:1,environment:'staging',shop:{products:[{data:{gallery:[
  {image:media('good.jpg',1200,900)},{image:media('missing.jpg')},{image:media('broken.jpg')}]}}]}}));
 let disposed=false;
 const open=async()=>({media:bucket(new Map([['good.jpg',good],['broken.jpg',Buffer.from('not an image')]])),dispose:async()=>{disposed=true;}});
 const report=await buildImages({environment:'staging',open,snapshotPath,output:join(dir,'public'),cache:join(dir,'cache')});
 assert.equal(disposed,true);
 assert.deepEqual(report.skipped.map(line=>line.split(':')[0]).sort(),['broken.jpg','missing.jpg']);
 assert.match(report.skipped.find(line=>line.startsWith('missing')),/missing in R2/);
 assert.deepEqual((await readdir(join(dir,'public','media'))).sort(),['good-480.webp','good-960.webp']);
 const gallery=JSON.parse(await readFile(snapshotPath,'utf8')).shop.products[0].data.gallery;
 assert.equal(imageView(gallery[0].image,'').srcset,'/media/good-480.webp 480w, /media/good-960.webp 960w');
 for(const row of gallery.slice(1)) {
  const view=imageView(row.image,'');
  assert.equal(view.srcset,undefined);
  assert.match(view.src,/^\/_emdash\/api\/media\/file\//);
 }
});

test('the images step refuses a snapshot from another environment',async t=>{
 const dir=await workspace(t);
 const snapshotPath=join(dir,'snapshot.json');
 await writeFile(snapshotPath,JSON.stringify({version:1,environment:'staging',shop:{}}));
 await assert.rejects(()=>buildImages({environment:'production',open:async()=>assert.fail('no bindings'),snapshotPath,output:join(dir,'public'),cache:join(dir,'cache')}),/staging, not production/);
});

test('an empty database writes no snapshot and releases its bindings',async t=>{
 const dir=await workspace(t);
 const db=new Kysely({dialect:createDialect({url:':memory:'})});t.after(()=>db.destroy());
 await runMigrations(db);await applyModelMigrations(db);
 let disposed=false;
 const path=join(dir,'snapshot.json');
 await assert.rejects(()=>writeSnapshot({environment:'staging',open:async()=>({db,dispose:async()=>{disposed=true;}}),path}),/no published products/);
 assert.equal(disposed,true);
 await assert.rejects(()=>access(path));
});
