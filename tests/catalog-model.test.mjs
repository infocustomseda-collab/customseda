import test from 'node:test';
import assert from 'node:assert/strict';
import {Kysely} from 'kysely';
import {createDialect} from 'emdash/db/sqlite';
import {runMigrations} from 'emdash/db';
import {ContentRepository,SchemaRegistry,OptionsRepository} from 'emdash';
import {applyCatalogModel,modelVersion} from '../src/lib/cms/model-migration.ts';
import {validateSeed} from 'emdash/seed';
import seed from '../seed/seed.json' with {type:'json'};

export async function database() {
 const db=new Kysely({dialect:createDialect({url:':memory:'})});
 await runMigrations(db);await applyCatalogModel(db);return db;
}
test('catalog seed is valid and exposes the approved separate bundle schema',()=>{
 assert.deepEqual(validateSeed(seed).errors,[]);
 assert.equal(seed.collections.length,11);
 const product=seed.collections.find(c=>c.slug==='products');
 const bundle=seed.collections.find(c=>c.slug==='conjuntos');
 assert.equal(product.fields.find(f=>f.slug==='available').defaultValue,true);
 assert.equal(product.fields.find(f=>f.slug==='sizes').validation.multiple,true);
 assert.equal(product.fields.find(f=>f.slug==='category').validation.multiple,false);
 assert.ok(!bundle.fields.some(f=>['sizes','color','collection','stock'].includes(f.slug)));
});
test('model migration is idempotent and preserves existing content, IDs and editorial changes',async t=>{
 const db=await database();t.after(()=>db.destroy());
 const repo=new ContentRepository(db);
 const first=await repo.findMany('categories');
 const top=first.items.find(c=>c.data.code==='top');
 await repo.update('categories',top.id,{data:{title:'My Top'}});
 const result=await applyCatalogModel(db);
 assert.equal(result.applied,false);
 assert.equal((await repo.findById('categories',top.id)).data.title,'My Top');
 assert.equal((await repo.findMany('categories')).items.length,2);
 assert.equal((await repo.findMany('sizes')).items.length,5);
 assert.ok(await new OptionsRepository(db).get(modelVersion));
 const registry=new SchemaRegistry(db);
 const product=await registry.getCollectionWithFields('products');
 assert.equal(product.fields.filter(f=>f.type==='reference').length,5);
 const relations=await db.selectFrom('_emdash_relations').selectAll().where('parent_collection','=','products').execute();
 assert.equal(relations.length,5);
 assert.equal(relations.find(r=>r.child_collection==='categories').max_children_per_parent,1);
});

test('an interrupted model installation repairs missing fields without replacing content',async t=>{
 const db=new Kysely({dialect:createDialect({url:':memory:'})});t.after(()=>db.destroy());
 await runMigrations(db);
 const registry=new SchemaRegistry(db);
 await registry.createCollection({slug:'products',label:'Productos',labelSingular:'Producto'});
 await applyCatalogModel(db);
 const product=await registry.getCollectionWithFields('products');
 assert.equal(product.fields.length,seed.collections.find(c=>c.slug==='products').fields.length);
});
