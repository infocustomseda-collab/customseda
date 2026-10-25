import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers/catalog.mjs';
import {applyShopifySourceSchema,importShopifyDraft,importRequestAllowed} from '../src/lib/cms/shopify-import.ts';

test('imports an incomplete source as a draft, preserves its options, rejects publication, and retries without duplicates',async t=>{
 const f=await fixture(t);
 await applyShopifySourceSchema(f.db);
 const input={collection:'products',slug:'caoba-no-sizes',data:{...f.data,shopify_id:'123',shopify_source:{source_key:'product:123',options:[{name:'Title',values:['Default Title']}] }},references:{category:[f.lookups.braguita],collection:[f.lookups.margarita],color:[f.colorId],sizes:[]}};
 const one=await importShopifyDraft(f.db,(...args)=>f.runtime.handleContentCreate(...args),input);
 assert.equal(one.created,true);
 assert.ok(one.validationErrors.some(x=>x.startsWith('sizes:')));
 const saved=await f.repo.findById('products',one.id);
 assert.equal(saved.status,'draft');assert.equal(saved.locale,'es');
 assert.deepEqual(saved.data.shopify_source.options,[{name:'Title',values:['Default Title']}]);
 assert.equal((await f.runtime.handleContentPublish('products',one.id)).success,false);
 const again=await importShopifyDraft(f.db,(...args)=>f.runtime.handleContentCreate(...args),input);
 assert.equal(again.created,false);assert.equal(again.id,one.id);
 assert.equal((await f.repo.findMany('products')).items.length,3);
 await assert.rejects(importShopifyDraft(f.db,(...args)=>f.runtime.handleContentCreate(...args),{...input,data:{...input.data,shopify_source:{source_key:'product:999'}}}),/collision/i);
});

test('source schema migration is repeatable and preserves the catalog fields',async t=>{
 const f=await fixture(t);await applyShopifySourceSchema(f.db);await applyShopifySourceSchema(f.db);
 const {SchemaRegistry}=await import('emdash');const r=new SchemaRegistry(f.db);
 assert.equal((await r.getField('products','price_cents')).required,true);
 assert.equal((await r.getField('products','shopify_source')).type,'json');
});

test('import boundary rejects deployed, remote-host, unauthenticated, and cross-origin requests',()=>{
 const req={dev:true,hostname:'localhost',role:50,origin:'http://localhost:4321',requestOrigin:'http://localhost:4321',csrf:'1'};
 assert.equal(importRequestAllowed(req),true);
 for(const change of [{dev:false},{hostname:'example.com'},{role:20},{requestOrigin:'https://evil.example'},{csrf:null}]) assert.equal(importRequestAllowed({...req,...change}),false);
});

test('Spanish imported drafts expose the seeded category and size selections in CMS reads',async t=>{
 const f=await fixture(t);await applyShopifySourceSchema(f.db);
 const input={collection:'products',slug:'spanish-top',data:{...f.data,shopify_id:'456',shopify_source:{source_key:'product:456'}},references:{category:[f.lookups.top],collection:[f.lookups.margarita],color:[f.colorId],sizes:[f.lookups.S,f.lookups.M]}};
 const imported=await importShopifyDraft(f.db,(...args)=>f.runtime.handleContentCreate(...args),input);
 const result=await f.runtime.handleContentGet('products',imported.id,'es',{includeDrafts:true});
 assert.equal(result.success,true);
 assert.deepEqual(result.data.item.references.category.children.map(x=>x.id),[f.lookups.top]);
 assert.deepEqual(result.data.item.references.sizes.children.map(x=>x.id),[f.lookups.S,f.lookups.M]);
});

test('imported draft sets do not block valid edits to their draft components',async t=>{
 const f=await fixture(t);await applyShopifySourceSchema(f.db);
 const create=(...args)=>f.runtime.handleContentCreate(...args);
 const entry=(slug,category)=>({collection:'products',slug,data:{...f.data,shopify_source:{source_key:`product:${slug}`}},references:{category:[f.lookups[category]],collection:[f.lookups.margarita],color:[f.colorId],sizes:[f.lookups.S]}});
 const top=await importShopifyDraft(f.db,create,entry('draft-top','top'));
 const bottom=await importShopifyDraft(f.db,create,entry('draft-bottom','braguita'));
 await importShopifyDraft(f.db,create,{collection:'conjuntos',slug:'draft-set',data:{...f.data,shopify_source:{source_key:'product:draft-set'}},references:{top:[top.id],bottom:[bottom.id]}});
 const {validateCatalogWrite}=await import('../src/lib/cms/catalog-store.ts');
 assert.deepEqual(await validateCatalogWrite(f.db,'products',top.id,{data:{price_cents:3200}}),[]);
});
