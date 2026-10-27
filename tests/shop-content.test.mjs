import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers/catalog.mjs';
import {applyStorefrontModel} from '../src/lib/cms/model-migration.ts';
import {loadShop} from '../src/lib/shop/content.ts';

test('production reads published entries with live values and resolved references only',async t=>{
 const f=await fixture(t);
 const shop=await loadShop(f.db,{drafts:false});
 assert.equal(shop.products.some(entry=>entry.data.bundle),false);
 assert.deepEqual(shop.products.map(e=>e.slug).sort(),['bottom-test','top-test']);
 const top=shop.products.find(p=>p.slug==='top-test');
 assert.deepEqual(top.refs.category,[f.lookups.top]);
 assert.deepEqual(top.refs.sizes.sort(),[f.lookups['top-s'],f.lookups['top-m']].sort());
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
 const bundle=preview.products.find(c=>c.id===f.bundle);
 assert.deepEqual(bundle.refs.components,[f.top,f.bottom]);
 assert.equal(bundle.data.bundle,true);
 const [settings]=preview.site_settings;
 assert.equal(settings.data.intro_title,'Primera colección');
 assert.deepEqual(settings.refs.featured_conjunto,[f.bundle]);
 assert.ok(!Object.keys(settings.data).some(key=>key.startsWith('_')));

 assert.deepEqual((await loadShop(f.db,{drafts:false})).site_settings,[]);
});

test('boolean fields read back as booleans whether stored on the row or in a revision',async t=>{
 const f=await fixture(t);
 await applyStorefrontModel(f.db);
 const popup=await f.runtime.handleContentCreate('popups',{slug:'envio',data:{title:'Envío',enabled:true}});
 assert.equal(popup.success,true,JSON.stringify(popup));
 const settings=await f.runtime.handleContentCreate('site_settings',{slug:'home',data:{title:'Seda',announcement_enabled:true}});
 assert.equal(settings.success,true,JSON.stringify(settings));
 const shop=await loadShop(f.db,{drafts:true});
 assert.equal(shop.popups[0].data.enabled,true);
 assert.equal(shop.site_settings[0].data.announcement_enabled,true);
 assert.equal(shop.products[0].data.available,true);
});
