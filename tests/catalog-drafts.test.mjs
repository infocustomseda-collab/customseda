import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers/catalog.mjs';
import {applyModelMigrations} from '../src/lib/cms/model-migration.ts';

test('native incomplete drafts are editable but cannot be published without supported sizes',async t=>{
 const f=await fixture(t);await applyModelMigrations(f.db);
 const result=await f.runtime.handleContentCreate('products',{slug:'needs-sizes',status:'draft',locale:'es',data:f.data,
  references:{category:[f.lookups.braguita],collection:[f.lookups.margarita],color:[f.colorId],sizes:[]}});
 assert.equal(result.success,true,JSON.stringify(result));
 const saved=await f.repo.findById('products',result.data.item.id);
 assert.equal(saved.status,'draft');
 assert.equal((await f.runtime.handleContentPublish('products',saved.id)).success,false);
});

test('Spanish native drafts expose seeded category and size selections through CMS reads',async t=>{
 const f=await fixture(t);await applyModelMigrations(f.db);
 const created=await f.runtime.handleContentCreate('products',{slug:'spanish-top',status:'draft',locale:'es',data:f.data,
  references:{category:[f.lookups.top],collection:[f.lookups.margarita],color:[f.colorId],sizes:[f.lookups.S,f.lookups.M]}});
 assert.equal(created.success,true,JSON.stringify(created));
 const result=await f.runtime.handleContentGet('products',created.data.item.id,'es',{includeDrafts:true});
 assert.equal(result.success,true);
 assert.deepEqual(result.data.item.references.category.children.map(x=>x.id),[f.lookups.top]);
 assert.deepEqual(result.data.item.references.sizes.children.map(x=>x.id),[f.lookups.S,f.lookups.M]);
});
