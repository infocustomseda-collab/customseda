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

for(const staged of [false,true]) test(`cleanup keeps duplicates referenced by ${staged?'a pending draft':'a saved selection'} and retires only unused copies`,async t=>{
 const {db,repo,duplicates}=await oldDuplicates(t);
 const material=await handleContentCreate(db,'materials',{locale:'es',slug:'referencing-material',data:{title:'Referenced'},references:staged?{}:{sizes:[duplicates[0].id]}});
 assert.equal(material.success,true);
 if(staged) {
  const revision=await new RevisionRepository(db).create({collection:'materials',entryId:material.data.item.id,data:{title:'Pending',_references:{sizes:[duplicates[0].id]}}});
  await repo.setDraftRevision('materials',material.data.item.id,revision.id);
 }
 const before=await repo.findById('sizes',duplicates[0].id);
 const references=await db.selectFrom('_emdash_content_references').selectAll().execute();
 const revisions=await db.selectFrom('revisions').selectAll().where('entry_id','=',material.data.item.id).execute();
 const result=await applySizeIdentities(db);
 assert.equal(result.retained,1);
 assert.equal(result.trashed,8);
 assert.equal((await repo.findMany('sizes',{limit:100})).items.length,10);
 assert.deepEqual(await repo.findById('sizes',duplicates[0].id),before);
 assert.deepEqual(await db.selectFrom('_emdash_content_references').selectAll().execute(),references);
 assert.deepEqual(await db.selectFrom('revisions').selectAll().where('entry_id','=',material.data.item.id).execute(),revisions);
});

test('historical material selections keep every referenced size and the original revision unchanged across migration retries',async t=>{
 const {db,repo,originals,duplicates}=await oldDuplicates(t);
 const material=await handleContentCreate(db,'materials',{locale:'es',slug:'historical-material',data:{title:'Historical'},references:{sizes:[originals[0].id]}});
 assert.equal(material.success,true);
 const saved={title:'Earlier material',_references:{sizes:[...originals,...duplicates].map(size=>size.id)}};
 const revision=await new RevisionRepository(db).create({collection:'materials',entryId:material.data.item.id,data:saved});
 const before=await db.selectFrom('revisions').selectAll().where('id','=',revision.id).executeTakeFirstOrThrow();
 const references=await db.selectFrom('_emdash_content_references').selectAll().execute();
 const result=await applySizeIdentities(db);
 assert.equal(result.retained,9);
 assert.equal(result.trashed,0);
 assert.deepEqual(await db.selectFrom('revisions').selectAll().where('id','=',revision.id).executeTakeFirstOrThrow(),before);
 for(const size of [...originals,...duplicates]) assert.deepEqual(await repo.findById('sizes',size.id),size);
 assert.deepEqual(await db.selectFrom('_emdash_content_references').selectAll().execute(),references);
 const marker=await new OptionsRepository(db).get(sizeIdentitiesVersion);
 assert.equal(marker.retained.length,9);
 assert.deepEqual(marker.trashed,[]);
 assert.equal((await applySizeIdentities(db)).applied,false);
 assert.deepEqual(await new OptionsRepository(db).get(sizeIdentitiesVersion),marker);
 // EmDash can still restore that unchanged historical selection into a new draft.
 const restored=await repo.restoreRevision('materials',material.data.item.id,saved,'test-editor');
 const draft=await db.selectFrom('revisions').select('data').where('id','=',restored.revisionId).executeTakeFirstOrThrow();
 assert.deepEqual(JSON.parse(draft.data)._references,saved._references);
 for(const id of saved._references.sizes) assert.ok(await repo.findById('sizes',id));
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

test('v2 consolidates retained historical size selections and frees the English locale for a real translation',async t=>{
 const {db,repo,originals,duplicates}=await oldDuplicates(t);
 const options=new OptionsRepository(db);
 const version='customseda.size-identities.v2';
 await options.delete(version);
 const bySlug=new Map(originals.map(size=>[size.slug,size]));
 const [first,second]=duplicates;
 const [firstOriginal,secondOriginal]=[first,second].map(size=>bySlug.get(size.slug));
 const material=await handleContentCreate(db,'materials',{locale:'es',slug:'old-material',data:{title:'Material'},references:{sizes:[secondOriginal.id]}});
 assert.equal(material.success,true);
 const entry=material.data.item;
 const revision=await new RevisionRepository(db).create({collection:'materials',entryId:entry.id,data:{
  title:'Earlier material',special_edition:true,
  _references:{sizes:[first.id,secondOriginal.id,firstOriginal.id,second.id],color:[]},
  _referencesBaseline:{sizes:[second.id,firstOriginal.id,secondOriginal.id]},
 }});
 const revisionRow=()=>db.selectFrom('revisions').selectAll().where('id','=',revision.id).executeTakeFirstOrThrow();
 const before=await revisionRow();
 await applySizeIdentities(db);
 const marker=await options.get(sizeIdentitiesVersion);
 assert.equal(marker.retained.length,2);
 // Resume a partial attempt that renamed one copy and already trashed another.
 for(const copy of [first,second]) {
  await repo.update('sizes',copy.id,{slug:`retired-seed-en-${copy.slug}-${copy.id.toLowerCase()}`});
 }
 await repo.delete('sizes',second.id);
 const partial=JSON.parse(before.data);
 for(const field of ['_references','_referencesBaseline']) {
  partial[field].sizes=[...new Set(partial[field].sizes.map(id=>id===second.id?secondOriginal.id:id))];
 }
 await db.updateTable('revisions').set({data:JSON.stringify(partial)}).where('id','=',revision.id).execute();
 const results=await applyModelMigrations(db);
 assert.equal(results.find(result=>result.version===version)?.applied,true);
 const after=await revisionRow();
 const expected={title:'Earlier material',special_edition:true,
  _references:{sizes:[firstOriginal.id,secondOriginal.id],color:[]},
  _referencesBaseline:{sizes:[secondOriginal.id,firstOriginal.id]},
 };
 assert.deepEqual({...after},{...before,data:JSON.stringify(expected)});
 assert.equal((await repo.findMany('sizes',{limit:100})).items.length,9);
 for(const copy of duplicates) assert.ok((await repo.findByIdIncludingTrashed('sizes',copy.id)).deletedAt);
 assert.deepEqual(await repo.findById('sizes',firstOriginal.id),firstOriginal);
 assert.deepEqual(await options.get(sizeIdentitiesVersion),marker);
 assert.ok((await applyModelMigrations(db)).every(result=>!result.applied));
 const restored=await repo.restoreRevision('materials',entry.id,JSON.parse(after.data),'test-editor');
 const draft=await db.selectFrom('revisions').select('data').where('id','=',restored.revisionId).executeTakeFirstOrThrow();
 assert.deepEqual(JSON.parse(draft.data)._references.sizes,expected._references.sizes);
 const translation=await handleContentCreate(db,'sizes',{locale:'en',translationOf:firstOriginal.id,slug:firstOriginal.slug,data:{title:'Translated size'}});
 assert.equal(translation.success,true);
 assert.equal(translation.data.item.translationGroup,firstOriginal.translationGroup);
 assert.equal(translation.data.item.data.label,firstOriginal.data.label);
});

test('v2 stops before rewriting revisions when a retained copy has an unexpected live link',async t=>{
 const {db,repo,duplicates}=await oldDuplicates(t);
 const options=new OptionsRepository(db);
 await options.delete('customseda.size-identities.v2');
 const copy=duplicates[0];
 const material=await handleContentCreate(db,'materials',{locale:'es',slug:'linked-copy',data:{title:'Live link'},references:{sizes:[copy.id]}});
 assert.equal(material.success,true);
 await applySizeIdentities(db);
 await assert.rejects(()=>applyModelMigrations(db),/live relation or menu/);
 assert.ok(await repo.findById('sizes',copy.id));
 assert.equal(await options.get('customseda.size-identities.v2'),null);
});

test('v2 refuses a scheduled draft while it still selects a retained copy',async t=>{
 const {db,repo,duplicates}=await oldDuplicates(t);
 const options=new OptionsRepository(db);
 const version='customseda.size-identities.v2';
 await options.delete(version);
 const copy=duplicates[0];
 const material=await repo.create({type:'materials',locale:'es',slug:'scheduled-material',data:{title:'Scheduled'}});
 const data={title:'Scheduled',_references:{sizes:[copy.id]}};
 const revisions=new RevisionRepository(db);
 const draft=await revisions.create({collection:'materials',entryId:material.id,data});
 await repo.setDraftRevision('materials',material.id,draft.id);
 await repo.schedule('materials',material.id,'2099-01-01T00:00:00Z');
 await applySizeIdentities(db);
 await assert.rejects(()=>applyModelMigrations(db),/scheduled material draft/);
 assert.deepEqual((await revisions.findById(draft.id)).data,data);
 assert.ok(await repo.findById('sizes',copy.id));
 assert.equal(await options.get(version),null);
});

test('v2 refuses a revision that uses a retained ID outside a material sizes array',async t=>{
 const {db,repo,duplicates}=await oldDuplicates(t);
 const options=new OptionsRepository(db);
 const version='customseda.size-identities.v2';
 await options.delete(version);
 const copy=duplicates[0];
 const material=await repo.create({type:'materials',locale:'es',slug:'unexpected-reference',data:{title:'Material'}});
 const data={title:'Earlier material',_references:{sizes:[copy.id]},'_references.sizes':[copy.id]};
 const revisions=new RevisionRepository(db);
 const revision=await revisions.create({collection:'materials',entryId:material.id,data});
 await applySizeIdentities(db);
 await assert.rejects(()=>applyModelMigrations(db),/Unexpected reference/);
 assert.deepEqual((await revisions.findById(revision.id)).data,data);
 assert.ok(await repo.findById('sizes',copy.id));
 assert.equal(await options.get(version),null);
});
