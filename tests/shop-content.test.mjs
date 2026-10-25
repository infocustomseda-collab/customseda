import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers/catalog.mjs';
import {applyStorefrontModel} from '../src/lib/cms/model-migration.ts';
import {loadShop} from '../src/lib/shop/content.ts';

test('production reads published entries with live values and resolved references only',async t=>{
 const f=await fixture(t);
 const shop=await loadShop(f.db,{drafts:false});
 assert.deepEqual(shop.conjuntos,[]);
 assert.deepEqual(shop.products.map(e=>e.slug).sort(),['bottom-test','top-test']);
 const top=shop.products.find(p=>p.slug==='top-test');
 assert.deepEqual(top.refs.category,[f.lookups.top]);
 assert.deepEqual(top.refs.sizes.sort(),[f.lookups.S,f.lookups.M].sort());
 assert.equal(top.data.price_cents,5000);

 const edit=await f.runtime.handleContentUpdate('products',f.top,{data:{title:'Top editado'}});
 assert.equal(edit.success,true,JSON.stringify(edit));
 assert.equal((await loadShop(f.db,{drafts:false})).products.find(p=>p.id===f.top).data.title,'top-test');
});

test('development preview adds drafts, pending revisions and staged references',async t=>{
 const f=await fixture(t);
 await applyStorefrontModel(f.db);
 await f.runtime.handleContentUpdate('products',f.top,{data:{title:'Top editado'}});
 const created=await f.runtime.handleContentCreate('site_settings',{slug:'home',data:{title:'Seda',intro_title:'Antes'}});
 assert.equal(created.success,true,JSON.stringify(created));
 const settingsId=created.data.item.id;
 const update=await f.runtime.handleContentUpdate('site_settings',settingsId,{data:{intro_title:'Primera colección'},references:{featured_conjunto:[f.bundle]}});
 assert.equal(update.success,true,JSON.stringify(update));

 const preview=await loadShop(f.db,{drafts:true});
 assert.equal(preview.products.find(p=>p.id===f.top).data.title,'Top editado');
 const bundle=preview.conjuntos.find(c=>c.id===f.bundle);
 assert.deepEqual([bundle.refs.top,bundle.refs.bottom],[[f.top],[f.bottom]]);
 const [settings]=preview.site_settings;
 assert.equal(settings.data.intro_title,'Primera colección');
 assert.deepEqual(settings.refs.featured_conjunto,[f.bundle]);
 assert.ok(!Object.keys(settings.data).some(key=>key.startsWith('_')));

 assert.deepEqual((await loadShop(f.db,{drafts:false})).site_settings,[]);
});
