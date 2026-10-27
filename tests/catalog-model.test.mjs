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
test('catalog seed exposes one product collection and native category taxonomy',()=>{
 assert.deepEqual(validateSeed(seed).errors,[]);
 assert.equal(seed.collections.length,10);
 const product=seed.collections.find(c=>c.slug==='products');
 // Availability follows the material's sizes; products have no Disponible flag.
 assert.ok(!product.fields.some(f=>f.slug==='available'));
 assert.equal(product.fields.find(f=>f.slug==='material').validation.targetCollection,'materials');
 assert.equal(product.fields.find(f=>f.slug==='material').validation.multiple,false);
 assert.ok(!product.fields.some(f=>['color','sizes'].includes(f.slug)));
 assert.equal(product.fields.find(f=>f.slug==='components').validation.multiple,true);
 assert.ok(!product.fields.some(f=>f.slug==='category'));
 assert.deepEqual(seed.taxonomies[0].collections,['products','sizes']);
});
test('model installation is idempotent and preserves editorial content and taxonomy terms',async t=>{
 const db=await database();t.after(()=>db.destroy());
 const repo=new ContentRepository(db);
 const item=await repo.create({type:'products',slug:'editorial',data:{title:'Original'}});
 await repo.update('products',item.id,{data:{title:'Edited'}});
 const result=await applyCatalogModel(db);assert.equal(result.applied,false);
 assert.equal((await repo.findById('products',item.id)).data.title,'Edited');
 assert.equal((await db.selectFrom('taxonomies').selectAll().where('name','=','category').execute()).length,6);
 assert.equal((await repo.findMany('sizes')).items.length,9);
 assert.ok(await new OptionsRepository(db).get(modelVersion));
 const relations=await db.selectFrom('_emdash_relations').selectAll().where('parent_collection','=','products').execute();
 assert.equal(relations.length,4);
 assert.ok(relations.some(r=>r.child_collection==='products'&&r.slug==='products_components'));
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
