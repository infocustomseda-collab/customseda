import test from 'node:test';
import assert from 'node:assert/strict';
import {Kysely,sql} from 'kysely';
import {createDialect} from 'emdash/db/sqlite';
import {runMigrations} from 'emdash/db';
import {ContentRepository,OptionsRepository,SchemaRegistry} from 'emdash';
import {applyCatalogModel,applyModelMigrations} from '../src/lib/cms/model-migration.ts';

test('model removes retired fields, revision metadata and mappings while preserving editorial content and references',async t=>{
 const db=new Kysely({dialect:createDialect({url:':memory:'})});t.after(()=>db.destroy());
 await runMigrations(db);await applyCatalogModel(db);
 const schema=new SchemaRegistry(db),repo=new ContentRepository(db),options=new OptionsRepository(db);
 for(const type of ['products','conjuntos','colors','pages','size_guides','site_settings','collections']) {
  await schema.createField(type,{slug:'shopify_source',label:'Source',type:'json'});
 }
 if(!await schema.getField('products','shopify_id')) await schema.createField('products',{slug:'shopify_id',label:'Source ID',type:'string'});
 const home=await repo.create({type:'site_settings',slug:'shopify-home',data:{title:'Edited home',hero_title:'Editorial title',shopify_source:{source_key:'site:home'}}});
 await db.insertInto('_emdash_media_usage_sources').values({source_key:'home-usage',source_type:'content',collection_slug:'site_settings',content_id:home.id,source_variant:'current',content_slug:'shopify-home',current_generation:'test'}).execute();
 const page=await repo.create({type:'pages',slug:'story',status:'draft',data:{title:'My story',shopify_source:{source_key:'old'}}});
 const data={title:'My edited draft',content:[{_type:'block',children:[{text:'Keep this'}]}],shopify_source:{source_key:'old'},shopify_id:'123',_references:{top:['stable-top']}};
 await db.insertInto('revisions').values({id:'old-revision',collection:'pages',entry_id:page.id,data:JSON.stringify(data),created_at:new Date().toISOString(),author_id:null}).execute();
 await options.set('customseda.shopify-map.pages.old',page.id);
 await options.set('customseda.shopify-source.v1',{appliedAt:'before'});
 await options.set('merchant-option',{keep:true});
 const before=await repo.findMany('categories');

 await applyModelMigrations(db);
 for(const type of ['products','conjuntos','colors','pages','size_guides','site_settings','collections']) {
  assert.equal(await schema.getField(type,'shopify_source'),null);
  const columns=(await sql`PRAGMA table_info(${sql.table(`ec_${type}`)})`.execute(db)).rows;
  assert.ok(!columns.some(c=>['shopify_id','shopify_source'].includes(c.name)));
 }
 assert.equal((await repo.findById('site_settings',home.id)).slug,'home');
 assert.equal((await db.selectFrom('_emdash_media_usage_sources').select('content_slug').where('source_key','=','home-usage').executeTakeFirstOrThrow()).content_slug,'home');
 assert.equal((await repo.findById('site_settings',home.id)).data.hero_title,'Editorial title');
 assert.equal((await repo.findById('pages',page.id)).status,'draft');
 const cleaned=JSON.parse((await db.selectFrom('revisions').select('data').where('id','=','old-revision').executeTakeFirstOrThrow()).data);
 const {shopify_id,shopify_source,...expected}=data;
 assert.deepEqual(cleaned,expected);
 assert.equal(await options.get('customseda.shopify-map.pages.old'),null);
 assert.equal(await options.get('customseda.shopify-source.v1'),null);
 assert.deepEqual(await options.get('merchant-option'),{keep:true});
 assert.deepEqual((await repo.findMany('categories')).items,before.items);
 assert.equal((await schema.getField('products','sizes')).required,false);
 assert.ok((await applyModelMigrations(db)).every(r=>!r.applied));
});

test('cleanup resumes after D1 removed field metadata but left the physical source column',async t=>{
 const db=new Kysely({dialect:createDialect({url:':memory:'})});t.after(()=>db.destroy());
 await runMigrations(db);await applyCatalogModel(db);
 // D1 cannot roll back the registry deletion and subsequent ALTER TABLE together.
 await sql`ALTER TABLE ec_products ADD COLUMN shopify_source JSON`.execute(db);
 await applyModelMigrations(db);
 const columns=(await sql`PRAGMA table_info(ec_products)`.execute(db)).rows;
 assert.ok(!columns.some(c=>c.name==='shopify_source'));
});
