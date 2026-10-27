import test from 'node:test';
import assert from 'node:assert/strict';
import {Kysely} from 'kysely';
import {createDialect} from 'emdash/db/sqlite';
import {runMigrations} from 'emdash/db';
import {sql} from 'kysely';
import {ContentRepository,RevisionRepository,SchemaRegistry,applySeed,handleContentCreate} from 'emdash';
import seed from '../seed/seed.json' with {type:'json'};
import {applySizeCategories} from '../src/lib/cms/size-categories.ts';
import {readCatalogEntry} from '../src/lib/cms/catalog-store.ts';

// The catalog before per-category sizes: five shared records identified by a code, without labels or categories.
async function legacyCatalog(t) {
 const legacy=structuredClone(seed);
 const sizes=legacy.collections.find(c=>c.slug==='sizes');
 sizes.fields=[...sizes.fields.filter(f=>f.slug!=='label'),{slug:'code',label:'Código estable',type:'string',required:true,unique:true,indexed:true}];
 legacy.taxonomies[0].collections=['products'];
 legacy.content.sizes=['XS','S','M','L','XL'].map((code,i)=>({id:`sizes-${code}`,slug:code.toLowerCase(),status:'published',data:{title:code,code,sort_order:i}}));
 const db=new Kysely({dialect:createDialect({url:':memory:'})});t.after(()=>db.destroy());
 await runMigrations(db);await applySeed(db,legacy,{includeContent:true,onConflict:'skip'});
 // Local lookups were created before the Spanish locale was configured.
 await db.updateTable('ec_sizes').set({locale:'fr'}).execute();
 const repo=new ContentRepository(db);
 const ids={};
 for(const size of (await repo.findMany('sizes')).items) ids[size.data.code]=size.id;
 const terms=Object.fromEntries((await db.selectFrom('taxonomies').select(['slug','id']).where('name','=','category').execute()).map(t=>[t.slug,t.id]));
 async function product(slug,category,sizes) {
  const created=await handleContentCreate(db,'products',{slug,data:{title:slug},references:{sizes:sizes.map(s=>ids[s])}});
  assert.equal(created.success,true,JSON.stringify(created));
  await db.insertInto('content_taxonomies').values({collection:'products',entry_id:created.data.item.id,taxonomy_id:terms[category]}).execute();
  return created.data.item.id;
 }
 return {db,repo,ids,product};
}

test('shared sizes become Braguita sizes, Top gets its own and Top products are repointed',async t=>{
 const {db,repo,ids,product}=await legacyCatalog(t);
 const top=await product('top-luz','top',['S','M']);
 const bottom=await product('braguita-luz','braguita',['XS','S']);
 const draft=await product('top-draft','top',['L']);
 const revision=await new RevisionRepository(db).create({collection:'products',entryId:draft,data:{title:'Draft',_references:{sizes:[ids.XL]}}});
 await repo.setDraftRevision('products',draft,revision.id);
 const history=await new RevisionRepository(db).create({collection:'sizes',entryId:ids.S,data:{title:'S',code:'S'}});

 const result=await applySizeCategories(db);
 assert.equal(result.applied,true);assert.equal(result.migrated,5);

 const sizes=new Map((await repo.findMany('sizes',{limit:50})).items.map(size=>[size.slug,size]));
 assert.deepEqual([...sizes.keys()].sort(),['braguita-l','braguita-m','braguita-s','braguita-xl','braguita-xs','top-l','top-m','top-s','top-xl']);
 // Existing records keep their IDs as the Braguita sizes.
 const xs=sizes.get('braguita-xs');
 assert.equal(xs.id,ids.XS);assert.equal(xs.data.label,'XS');assert.equal(xs.data.title,'XS · Braguita');assert.equal(xs.slug,'braguita-xs');
 assert.equal(sizes.size,9);assert.equal(xs.data.code,undefined);assert.equal(xs.locale,sizes.get('top-s').locale);assert.notEqual(xs.locale,'fr');
 assert.equal(sizes.get('top-s').data.label,'S');assert.equal(sizes.get('top-s').status,'published');
 const category=async code=>(await readCatalogEntry(db,'sizes',sizes.get(code).id)).refs.category;
 const term=async slug=>(await db.selectFrom('taxonomies').select('translation_group').where('name','=','category').where('slug','=',slug).executeTakeFirstOrThrow()).translation_group;
 assert.deepEqual(await category('braguita-xs'),[await term('braguita')]);
 assert.deepEqual(await category('top-xl'),[await term('top')]);

 const selected=async id=>(await readCatalogEntry(db,'products',id,false)).refs.sizes.sort();
 assert.deepEqual(await selected(top),[sizes.get('top-s').id,sizes.get('top-m').id].sort());
 assert.deepEqual(await selected(bottom),[ids.XS,ids.S].sort());
 assert.deepEqual(await selected(draft),[sizes.get('top-l').id]);
 assert.deepEqual((await readCatalogEntry(db,'products',draft,true)).refs.sizes,[sizes.get('top-xl').id]);

 // The native slug replaces the code: field, column and revision copies are gone.
 assert.equal(await new SchemaRegistry(db).getField('sizes','code'),null);
 assert.ok(!(await sql`PRAGMA table_info(ec_sizes)`.execute(db)).rows.some(column=>column.name==='code'));
 assert.equal((await new RevisionRepository(db).findById(history.id)).data.code,undefined);
 const def=await db.selectFrom('_emdash_taxonomy_defs').select('collections').where('name','=','category').executeTakeFirstOrThrow();
 assert.deepEqual(JSON.parse(def.collections),['products','sizes']);
 assert.equal((await applySizeCategories(db)).applied,false);
});

test('pending size drafts stop the migration before any change',async t=>{
 const {db,repo,ids}=await legacyCatalog(t);
 const revision=await new RevisionRepository(db).create({collection:'sizes',entryId:ids.S,data:{title:'S',code:'S'}});
 await repo.setDraftRevision('sizes',ids.S,revision.id);
 await assert.rejects(applySizeCategories(db),/pending size drafts/);
 assert.equal((await repo.findById('sizes',ids.S)).data.code,'S');
});
