import test from 'node:test';
import assert from 'node:assert/strict';
import {Kysely,sql} from 'kysely';
import {createDialect} from 'emdash/db/sqlite';
import {runMigrations} from 'emdash/db';
import {ContentRepository} from 'emdash';
import {applyModelMigrations} from '../src/lib/cms/model-migration.ts';
import {assertBuildEnvironment,assertPublishable,createSnapshot} from '../src/lib/shop/snapshot.ts';

async function database(t) {
 const db=new Kysely({dialect:createDialect({url:':memory:'})});t.after(()=>db.destroy());
 await runMigrations(db);await applyModelMigrations(db);return db;
}
async function menu(db,name,items) {
 const id=`menu-${name}`;
 await sql`INSERT INTO _emdash_menus (id,name,label,locale,translation_group) VALUES (${id},${name},${name},'es',${id})`.execute(db);
 for(const [i,item] of items.entries()) await sql`INSERT INTO _emdash_menu_items (id,menu_id,sort_order,type,custom_url,reference_collection,reference_id,label)
  VALUES (${`${id}-${i}`},${id},${item.sort??i},${item.type??'custom'},${item.url??null},${item.collection??null},${item.ref??null},${item.label})`.execute(db);
}

test('createSnapshot reads published entries only and both menus in order',async t=>{
 const db=await database(t);
 const repo=new ContentRepository(db);
 const published=await repo.create({type:'pages',slug:'envios',status:'published',data:{title:'Envíos'}});
 await repo.create({type:'pages',slug:'borrador',status:'draft',data:{title:'Borrador'}});
 await menu(db,'primary',[{label:'Bikinis',url:'/collections/bikinis',sort:1},{label:'Inicio',url:'/',sort:0},
  {label:'Envíos',type:'page',collection:'pages',ref:published.translationGroup??published.id,sort:2},{label:'Oculta',type:'page',collection:'pages',ref:'missing',sort:3}]);
 await menu(db,'footer',[{label:'Contacto',url:'/pages/contact'}]);
 const snapshot=await createSnapshot(db,'staging');
 assert.equal(snapshot.version,1);
 assert.equal(snapshot.environment,'staging');
 assert.ok(!Number.isNaN(Date.parse(snapshot.generatedAt)));
 assert.deepEqual(snapshot.shop.pages.map(p=>p.slug),['envios']);
 assert.deepEqual(snapshot.menus.primary.items.map(i=>[i.label,i.url]),[['Inicio','/'],['Bikinis','/collections/bikinis'],['Envíos','/pages/envios']]);
 assert.deepEqual(snapshot.menus.footer.items.map(i=>i.url),['/pages/contact']);
 // A missing menu is an empty menu, not a failure.
 await sql`DELETE FROM _emdash_menus WHERE name='footer'`.execute(db);
 assert.deepEqual((await createSnapshot(db,'local')).menus.footer.items,[]);
});

test('draft snapshots are local only',async t=>{
 const db=await database(t);
 await new ContentRepository(db).create({type:'pages',slug:'borrador',status:'draft',data:{title:'Borrador'}});
 assert.deepEqual((await createSnapshot(db,'local',{drafts:true})).shop.pages.map(p=>p.slug),['borrador']);
 await assert.rejects(()=>createSnapshot(db,'staging',{drafts:true}),/local only/);
});

const snap=(environment,{products=[],conjuntos=[]}={})=>({version:1,environment,generatedAt:new Date().toISOString(),shop:{products,conjuntos},menus:{}});

test('assertPublishable refuses another environment',()=>{
 assert.throws(()=>assertPublishable(snap('staging',{products:[{}]}),{environment:'production',allowEmpty:false}),/staging/);
});

test('assertPublishable refuses an empty catalog unless allowed',()=>{
 assert.throws(()=>assertPublishable(snap('production'),{environment:'production',allowEmpty:false}),/no published products/i);
 assert.doesNotThrow(()=>assertPublishable(snap('production'),{environment:'production',allowEmpty:true}));
 assert.doesNotThrow(()=>assertPublishable(snap('production',{products:[{data:{bundle:true}}]}),{environment:'production',allowEmpty:false}));
});

test('a build refuses a snapshot from another environment than CLOUDFLARE_ENV',()=>{
 assert.doesNotThrow(()=>assertBuildEnvironment(snap('staging',{products:[{}]}),'staging'));
 assert.doesNotThrow(()=>assertBuildEnvironment(snap('local'),undefined));
 assert.throws(()=>assertBuildEnvironment(snap('staging',{products:[{}]}),'production'),/staging snapshot.*production build/);
 assert.throws(()=>assertBuildEnvironment(snap('local'),'staging'),/local snapshot/);
});
