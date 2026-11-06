import test from 'node:test';
import assert from 'node:assert/strict';
import {Kysely,sql} from 'kysely';
import {createDialect} from 'emdash/db/sqlite';
import {runMigrations} from 'emdash/db';
import {ContentRepository,SchemaRegistry,handleContentCreate,applySeed} from 'emdash';
import seed from '../seed/seed.json' with {type:'json'};
import {applyCatalogModel,applyModelMigrations} from '../src/lib/cms/model-migration.ts';
import {applySizeIdentities,sizeIdentitiesVersion} from '../src/lib/cms/size-identities.ts';
import {OptionsRepository,RevisionRepository} from 'emdash';

async function fixture(t) {
 const db=new Kysely({dialect:createDialect({url:':memory:'})});t.after(()=>db.destroy());
 await runMigrations(db);await applyCatalogModel(db);
 return {db,repo:new ContentRepository(db),schema:new SchemaRegistry(db)};
}

async function oldDuplicates(t) {
 const f=await fixture(t);
 await applyModelMigrations(f.db);
 await new OptionsRepository(f.db).delete(sizeIdentitiesVersion);
 // Reproduce the production history: Spanish catalog, then an English seed run.
 await sql`UPDATE ec_sizes SET locale='es'`.execute(f.db);
 for(const slug of ['label','sort_order']) {
  const field=await f.schema.getField('sizes',slug);
  await f.db.updateTable('_emdash_fields').set({translatable:1}).where('id','=',field.id).execute();
 }
 const originals=(await f.repo.findMany('sizes',{limit:100})).items;
 // The old derived payload dropped defaultLocale, creating independent English
 // sizes and taxonomy terms instead of translations of the Spanish catalog.
 await applySeed(f.db,{version:'1',content:{sizes:seed.content.sizes},taxonomies:seed.taxonomies},{includeContent:true,onConflict:'skip'});
 const duplicates=(await f.repo.findMany('sizes',{limit:100,where:{locale:'en'}})).items;
 return {...f,originals,duplicates};
}

test('CLI catalog installation creates Spanish lookup records without needing Astro runtime config',async t=>{
 const {db}=await fixture(t);
 for(const table of ['ec_sizes','ec_collections']) {
  const rows=(await sql`SELECT DISTINCT locale FROM ${sql.table(table)} WHERE deleted_at IS NULL`.execute(db)).rows;
  assert.deepEqual(rows.map(r=>r.locale),['es']);
 }
 assert.deepEqual((await db.selectFrom('taxonomies').select('locale').distinct().where('name','=','category').execute()).map(r=>r.locale),['es']);
});

test('cleanup refuses edited duplicate sizes before trashing any candidate',async t=>{
 const {db,repo,duplicates}=await oldDuplicates(t);
 await repo.update('sizes',duplicates.at(-1).id,{data:{title:'An edited title'}});
 await assert.rejects(()=>applySizeIdentities(db),/English copy has edits/);
 assert.equal((await repo.findMany('sizes',{limit:100})).items.length,18);
 assert.equal(await new OptionsRepository(db).get(sizeIdentitiesVersion),null);
});

test('cleanup preserves a copy whose native category was edited even when field values match',async t=>{
 const {db,repo,duplicates}=await oldDuplicates(t);
 const duplicate=duplicates[0];
 await db.deleteFrom('content_taxonomies').where('collection','=','sizes').where('entry_id','=',duplicate.translationGroup??duplicate.id).execute();
 await assert.rejects(()=>applySizeIdentities(db),/category assignments differ/);
 assert.equal((await repo.findMany('sizes',{limit:100})).items.length,18);
});

test('cleanup resumes an interrupted rename without leaving an active duplicate',async t=>{
 const {db,repo,duplicates}=await oldDuplicates(t);
 const duplicate=duplicates[0];
 await repo.update('sizes',duplicate.id,{slug:`retired-seed-en-${duplicate.slug}-${duplicate.id.toLowerCase()}`});
 await applySizeIdentities(db);
 assert.equal((await repo.findMany('sizes',{limit:100})).items.length,9);
 assert.ok((await repo.findByIdIncludingTrashed('sizes',duplicate.id)).deletedAt);
});

for(const staged of [false,true]) test(`cleanup refuses duplicates referenced by ${staged?'a pending draft':'a saved selection'}`,async t=>{
 const {db,repo,duplicates}=await oldDuplicates(t);
 const material=await handleContentCreate(db,'materials',{locale:'es',slug:'referencing-material',data:{title:'Referenced'},references:staged?{}:{sizes:[duplicates[0].id]}});
 assert.equal(material.success,true);
 if(staged) {
  const revision=await new RevisionRepository(db).create({collection:'materials',entryId:material.data.item.id,data:{title:'Pending',_references:{sizes:[duplicates[0].id]}}});
  await repo.setDraftRevision('materials',material.data.item.id,revision.id);
 }
 await assert.rejects(()=>applySizeIdentities(db),/are referenced/);
 assert.equal((await repo.findMany('sizes',{limit:100})).items.length,18);
});

test('genuine translations keep one size identity with a translated title and shared size values',async t=>{
 const {db,repo,schema}=await fixture(t);
 const original=(await repo.findMany('sizes',{limit:1})).items[0];
 const created=await handleContentCreate(db,'sizes',{locale:'en',translationOf:original.id,slug:original.slug,data:{title:'Translated size'}});
 assert.equal(created.success,true,JSON.stringify(created));
 const translated=created.data.item;
 await applySizeIdentities(db);
 const kept=await repo.findById('sizes',translated.id);
 assert.equal(kept.translationGroup,original.translationGroup);
 assert.equal(kept.data.title,'Translated size');
 assert.equal(kept.data.label,original.data.label);
 assert.equal(kept.data.sort_order,original.data.sort_order);
 assert.equal((await schema.getField('sizes','title')).translatable,true);
 assert.equal((await repo.findMany('sizes',{limit:100})).items.length,10);
});

test('size cleanup preserves Spanish identities and material selections and trashes only redundant English copies',async t=>{
 const {db,repo,schema,originals,duplicates}=await oldDuplicates(t);
 const material=await handleContentCreate(db,'materials',{locale:'es',slug:'kept-material',data:{title:'Kept'},references:{sizes:[originals[0].id]}});
 assert.equal(material.success,true);
 const before=await db.selectFrom('_emdash_content_references').selectAll().execute();
 await applyModelMigrations(db);
 const sizes=(await repo.findMany('sizes',{limit:100})).items;
 assert.equal(sizes.length,9);
 assert.deepEqual(sizes.map(s=>s.id).sort(),originals.map(s=>s.id).sort());
 for(const size of duplicates) assert.ok((await repo.findByIdIncludingTrashed('sizes',size.id)).deletedAt);
 for(const original of originals) assert.deepEqual(await repo.findById('sizes',original.id),original);
 assert.deepEqual(await db.selectFrom('_emdash_content_references').selectAll().execute(),before);
 assert.equal((await schema.getField('sizes','title')).translatable,true);
 assert.equal((await schema.getField('sizes','label')).translatable,false);
 assert.equal((await schema.getField('sizes','sort_order')).translatable,false);
 assert.ok((await applyModelMigrations(db)).every(result=>!result.applied));
 const translation=await handleContentCreate(db,'sizes',{locale:'en',translationOf:originals[0].id,slug:originals[0].slug,data:{title:'English translation'}});
 assert.equal(translation.success,true,JSON.stringify(translation));
 assert.equal(translation.data.item.translationGroup,originals[0].translationGroup);
});
