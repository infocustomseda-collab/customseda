import test from 'node:test';
import assert from 'node:assert/strict';
import {Kysely} from 'kysely';
import {createDialect} from 'emdash/db/sqlite';
import {runMigrations} from 'emdash/db';
import {ContentRepository,SchemaRegistry,OptionsRepository} from 'emdash';
import {validateSeed} from 'emdash/seed';
import {applyCatalogModel,applyModelMigrations,modelVersion,storefrontVersion,collectionPagesVersion,colorSlugsVersion} from '../src/lib/cms/model-migration.ts';
import {cleanupVersion} from '../src/lib/cms/retire-import.ts';
import {checkoutVersion} from '../src/lib/commerce/payments.ts';
import {sizeCategoriesVersion} from '../src/lib/cms/size-categories.ts';
import storefront from '../seed/storefront.json' with {type:'json'};

const fields=['featured_conjunto','slideshow','intro_title','intro_text','highlights','tiktok_url'];
async function catalogOnly(t) {
 const db=new Kysely({dialect:createDialect({url:':memory:'})});t.after(()=>db.destroy());
 await runMigrations(db);await applyCatalogModel(db);return db;
}

test('storefront seed is valid and only extends site settings',()=>{
 assert.deepEqual(validateSeed(storefront).errors,[]);
 assert.deepEqual(storefront.collections.map(c=>c.slug),['site_settings']);
 assert.deepEqual(storefront.collections[0].fields.map(f=>f.slug),fields);
 assert.equal(storefront.content,undefined);
});

test('storefront migration adds homepage fields to an existing catalog database without touching content',async t=>{
 const db=await catalogOnly(t);
 const schema=new SchemaRegistry(db);
 // Simulates the editorial field that is not part of either seed.
 await schema.createField('site_settings',{slug:'editor_notes',label:'Fuente',type:'json',required:false});
 const repo=new ContentRepository(db);
 const settings=await repo.create({type:'site_settings',slug:'home',data:{title:'Seda',hero_title:'MARGARITA'}});
 // Colecciones were installed with public listing pages.
 await schema.updateCollection('collections',{routable:true,urlPattern:'/collections/{slug}',supports:['drafts','revisions','scheduling','seo']});
 // Colors were identified by a separate code.
 await schema.createField('colors',{slug:'code',label:'Código estable',type:'string',required:true,unique:true,indexed:true});
 const rosa=await repo.create({type:'colors',slug:'rosa',data:{title:'Rosa',code:'rosa'}});

 const first=await applyModelMigrations(db);
 assert.deepEqual(first.map(r=>[r.version,r.applied]),[[modelVersion,false],[storefrontVersion,true],[checkoutVersion,true],[cleanupVersion,true],[sizeCategoriesVersion,true],[collectionPagesVersion,true],[colorSlugsVersion,true]]);
 const collection=await schema.getCollectionWithFields('site_settings');
 const slugs=collection.fields.map(f=>f.slug);
 for(const slug of [...fields,'hero_title','hero_image','editor_notes']) assert.ok(slugs.includes(slug),slug);
 const relation=await db.selectFrom('_emdash_relations').selectAll().where('parent_collection','=','site_settings').executeTakeFirstOrThrow();
 assert.equal(relation.child_collection,'products');
 assert.equal(relation.max_children_per_parent,1);
 assert.equal((await repo.findById('site_settings',settings.id)).data.hero_title,'MARGARITA');
 const collections=await schema.getCollection('collections');
 assert.equal(collections.routable,false);assert.equal(collections.urlPattern??null,null);
 assert.deepEqual(collections.supports,['drafts','revisions']);
 assert.equal(await schema.getField('colors','code'),null);
 const color=await repo.findById('colors',rosa.id);assert.equal(color.slug,'rosa');assert.equal(color.data.code,undefined);

 const second=await applyModelMigrations(db);
 assert.deepEqual(second.map(r=>r.applied),[false,false,false,false,false,false,false]);
 assert.ok(await new OptionsRepository(db).get(storefrontVersion));
 assert.equal((await db.selectFrom('_emdash_relations').selectAll().where('parent_collection','=','site_settings').execute()).length,1);
});

test('a fresh database receives the catalog, storefront and checkout models in order',async t=>{
 const db=new Kysely({dialect:createDialect({url:':memory:'})});t.after(()=>db.destroy());
 await runMigrations(db);
 const results=await applyModelMigrations(db);
 assert.deepEqual(results.map(r=>[r.version,r.applied]),[[modelVersion,true],[storefrontVersion,true],[checkoutVersion,true],[cleanupVersion,true],[sizeCategoriesVersion,true],[collectionPagesVersion,true],[colorSlugsVersion,true]]);
 const repeater=(await new SchemaRegistry(db).getField('site_settings','highlights'));
 assert.equal(repeater.type,'repeater');
 assert.deepEqual(repeater.validation.subFields.map(f=>f.slug),['image','alt','title','text']);
});
