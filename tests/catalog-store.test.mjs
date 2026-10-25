import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers/catalog.mjs';
import {handleContentUpdate,handleContentGet} from 'emdash';
import {readCatalogEntry,validateCatalogWrite,catalogDependents,removalAllowed} from '../src/lib/cms/catalog-store.ts';

test('runtime policies publish valid mixed-size bundles with their own price',async t=>{
 const f=await fixture(t);
 assert.deepEqual(await validateCatalogWrite(f.db,'conjuntos',f.bundle,{}, {publish:true}),[]);
 const result=await f.runtime.handleContentPublish('conjuntos',f.bundle);
 assert.equal(result.success,true,JSON.stringify(result));
 const entry=await readCatalogEntry(f.db,'conjuntos',f.bundle,false);
 assert.equal(entry.data.price_cents,8500);assert.deepEqual(entry.refs.top,[f.top]);
});
test('reference-only writes are checked against merged existing fields',async t=>{
 const f=await fixture(t);
 const errors=await validateCatalogWrite(f.db,'conjuntos',f.bundle,{references:{top:[f.bottom]}});
 assert.ok(errors.some(e=>e.includes('Top')));
 assert.ok((await validateCatalogWrite(f.db,'products',f.top,{references:{sizes:[f.lookups.XS]}})).length);
});
test('native publish and schedule policies inspect staged references from non-REST writers',async t=>{
 const f=await fixture(t);
 assert.equal((await f.runtime.handleContentPublish('conjuntos',f.bundle)).success,true);
 const update=await f.runtime.handleContentUpdate('conjuntos',f.bundle,{references:{top:[f.bottom]}});
 assert.equal(update.success,true,JSON.stringify(update));
 const staged=await readCatalogEntry(f.db,'conjuntos',f.bundle,true);
 const live=await readCatalogEntry(f.db,'conjuntos',f.bundle,false);
 assert.deepEqual(staged.refs.top,[f.bottom]);assert.deepEqual(live.refs.top,[f.top]);
 const publication=await f.runtime.handleContentPublish('conjuntos',f.bundle);
 assert.equal(publication.success,false,JSON.stringify(publication));
 const scheduled=await f.runtime.handleContentSchedule('conjuntos',f.bundle,new Date(Date.now()+86400000).toISOString());
 assert.equal(scheduled.success,false,JSON.stringify(scheduled));
});
test('dependent bundles protect product recategorization, deletion and unpublication',async t=>{
 const f=await fixture(t);
 const deps=await catalogDependents(f.db,await readCatalogEntry(f.db,'products',f.top));
 assert.ok(deps.some(e=>e.id===f.bundle));assert.equal(await removalAllowed(f.db,'products',f.top),false);
 const errors=await validateCatalogWrite(f.db,'products',f.top,{references:{category:[f.lookups.braguita]}});
 assert.ok(errors.some(e=>e.includes('rompería')));
 const unpublish=await f.runtime.handleContentUnpublish('products',f.top);
 assert.equal(unpublish.success,false,JSON.stringify(unpublish));
 const deletion=await f.runtime.handleContentDelete('products',f.top);
 assert.equal(deletion.success,false,JSON.stringify(deletion));
});
test('native beforeSave rejects invalid prices, staged scalar data is revalidated',async t=>{
 const f=await fixture(t);
 const invalid=await f.runtime.handleContentUpdate('products',f.top,{data:{price_cents:-100}});
 assert.equal(invalid.success,false,JSON.stringify(invalid));
 const update=await handleContentUpdate(f.db,'products',f.top,{data:{price_cents:1.25}});
 assert.equal(update.success,true,JSON.stringify(update));
 const publish=await f.runtime.handleContentPublish('products',f.top);
 assert.equal(publish.success,false,JSON.stringify(publish));
});

test('catalog validation stays within the Free-tier D1 query budget',async t=>{
 const f=await fixture(t);
 // Record the actual compiled statements without mocking their results.
 let queries=0;
 const executor=f.db.getExecutor();
 const original=executor.executeQuery.bind(executor);
 executor.executeQuery=(...args)=>{queries++;return original(...args);};
 assert.deepEqual(await validateCatalogWrite(f.db,'conjuntos',f.bundle,{}, {publish:true}),[]);
 t.diagnostic(`Bundle validation: ${queries} SQL statements`);
 assert.ok(queries<=40,`Expected at most 40 statements, received ${queries}`);
});

test('component validation with dependent bundles also stays within its D1 budget',async t=>{
 const f=await fixture(t);
 let queries=0;
 const executor=f.db.getExecutor();const execute=executor.executeQuery.bind(executor);
 executor.executeQuery=(...args)=>{queries++;return execute(...args);};
 assert.deepEqual(await validateCatalogWrite(f.db,'products',f.top,{data:{price_cents:6000}}),[]);
 t.diagnostic(`Component validation: ${queries} SQL statements`);
 assert.ok(queries<=35,`Expected at most 35 statements, received ${queries}`);
});

test('publication rejects changes to stable lookup codes even when staged outside REST',async t=>{
 const f=await fixture(t);
 const {RevisionRepository}=await import('emdash');
 const revision=await new RevisionRepository(f.db).create({collection:'categories',entryId:f.lookups.top,data:{title:'Top',code:'braguita'}});
 await f.repo.setDraftRevision('categories',f.lookups.top,revision.id);
 const published=await f.runtime.handleContentPublish('categories',f.lookups.top);
 assert.equal(published.success,false,JSON.stringify(published));
});
test('publication reads pending prices and rejects unfinished media uploads',async t=>{
 const f=await fixture(t);
 const {RevisionRepository}=await import('emdash');
 const original=await readCatalogEntry(f.db,'products',f.top,false);
 const revision=await new RevisionRepository(f.db).create({collection:'products',entryId:f.top,data:{...original.data,price_cents:1.5}});
 await f.repo.setDraftRevision('products',f.top,revision.id);
 assert.equal((await readCatalogEntry(f.db,'products',f.top,false)).data.price_cents,5000);
 assert.equal((await readCatalogEntry(f.db,'products',f.top,true)).data.price_cents,1.5);
 assert.equal((await f.runtime.handleContentPublish('products',f.top)).success,false);
 await f.db.updateTable('media').set({status:'pending'}).where('id','=',f.image.id).execute();
 const errors=await validateCatalogWrite(f.db,'conjuntos',f.bundle,{}, {publish:true});
 assert.ok(errors.some(e=>e.includes('imagen')),JSON.stringify(errors));
});

test('EmDash persists availability as Yes when omitted on product creation',async t=>{
 const f=await fixture(t);
 const data={...f.data,title:'Default availability'};delete data.available;
 const references={category:[f.lookups.top],collection:[f.lookups.margarita],color:[f.colorId],sizes:[f.lookups.S]};
 const created=await f.runtime.handleContentCreate('products',{slug:'default-availability',data,references});
 assert.equal(created.success,true,JSON.stringify(created));
 assert.equal((await readCatalogEntry(f.db,'products',created.data.item.id)).data.available,true);
});

test('Contributor REST create and reference-only PUT cannot bypass relationship rules',async t=>{
 const f=await fixture(t);
 const {catalogWriteMiddleware}=await import('../src/lib/cms/write-middleware.ts');
 async function request(method,path,body){
  const url=new URL(`http://localhost:4321/_emdash/api/content/${path}`);
  return catalogWriteMiddleware({url,request:new Request(url,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),locals:{user:{id:'contributor',role:20},emdash:{db:f.db}}},async()=>new Response(null,{status:204}));
 }
 const create=await request('POST','conjuntos',{data:{...f.data,price_cents:8500},references:{top:[f.bottom],bottom:[f.bottom]}});
 assert.equal(create.status,400);
 const update=await request('PUT',`conjuntos/${f.bundle}`,{references:{top:[f.bottom]}});
 assert.equal(update.status,400);
 const valid=await request('PUT',`conjuntos/${f.bundle}`,{references:{top:[f.top]}});
 assert.equal(valid.status,204);
});

test('optional size guides must be published before product publication',async t=>{
 const f=await fixture(t);
 const guide=await f.runtime.handleContentCreate('size_guides',{data:{title:'Guía'},slug:'guia'});
 assert.equal(guide.success,true,JSON.stringify(guide));
 const id=guide.data.item.id;
 const update=await f.runtime.handleContentUpdate('products',f.top,{references:{size_guide:[id]}});
 assert.equal(update.success,true,JSON.stringify(update));
 const publish=await f.runtime.handleContentPublish('products',f.top);
 assert.equal(publish.success,false,JSON.stringify(publish));
 assert.equal((await f.runtime.handleContentPublish('size_guides',id)).success,true);
 assert.equal((await f.runtime.handleContentPublish('products',f.top)).success,true);
});

test('Products and Conjuntos cannot share a slug: both use /products/<slug>',async t=>{
 const f=await fixture(t);
 const bundle={slug:'top-test',data:{...f.data,price_cents:8500},references:{top:[f.top],bottom:[f.bottom]}};
 assert.ok((await validateCatalogWrite(f.db,'conjuntos',undefined,bundle)).some(e=>e.includes('dirección')));
 assert.ok((await validateCatalogWrite(f.db,'products',f.top,{slug:'test-set'})).some(e=>e.includes('dirección')));
 assert.deepEqual(await validateCatalogWrite(f.db,'products',f.top,{slug:'top-unico'}),[]);
 // A native writer can still stage the collision; publication rechecks the stored slug.
 const staged=await f.runtime.handleContentCreate('conjuntos',{slug:'bottom-test',data:bundle.data,references:bundle.references});
 assert.equal(staged.success,true,JSON.stringify(staged));
 assert.ok((await validateCatalogWrite(f.db,'conjuntos',staged.data.item.id,{},{publish:true})).some(e=>e.includes('dirección')));
});
