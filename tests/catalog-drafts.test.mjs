import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers/catalog.mjs';
import {applyModelMigrations} from '../src/lib/cms/model-migration.ts';

test('native incomplete drafts are editable but cannot be published without a material',async t=>{
 const f=await fixture(t);await applyModelMigrations(f.db);
 const result=await f.runtime.handleContentCreate('products',{slug:'needs-material',status:'draft',locale:'es',data:f.data,
  references:{collection:[f.lookups.margarita],material:[]}});
 assert.equal(result.success,true,JSON.stringify(result));
 await f.taxonomy.setTermsForEntry('products',result.data.item.id,'category',[f.lookups.braguita]);
 const saved=await f.repo.findById('products',result.data.item.id);
 assert.equal(saved.status,'draft');
 assert.equal((await f.runtime.handleContentPublish('products',saved.id)).success,false);
});

test('Spanish native drafts expose seeded category and material selections through CMS reads',async t=>{
 const f=await fixture(t);await applyModelMigrations(f.db);
 const created=await f.runtime.handleContentCreate('products',{slug:'spanish-top',status:'draft',locale:'es',data:f.data,
  references:{collection:[f.lookups.margarita],material:[f.materialId]}});
 assert.equal(created.success,true,JSON.stringify(created));
 await f.taxonomy.setTermsForEntry('products',created.data.item.id,'category',[f.lookups.top]);
 const result=await f.runtime.handleContentGet('products',created.data.item.id,'es',{includeDrafts:true});
 assert.equal(result.success,true);
 const {readCatalogEntry}=await import('../src/lib/cms/catalog-store.ts');
 assert.deepEqual((await readCatalogEntry(f.db,'products',created.data.item.id)).refs.category,[f.lookups.top]);
 assert.deepEqual(result.data.item.references.material.children.map(x=>x.id),[f.materialId]);
});
