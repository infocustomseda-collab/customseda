import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildCatalogPlan,portableTextFromHtml,assertLocalOrigin,assertShopifyAsset} from '../scripts/import/shopify-plan.mjs';
const inventory=JSON.parse(await readFile(new URL('../docs/import/shopify-public-inventory.json',import.meta.url)));
test('preserves website prices, missing sizes, independent bundle options and gallery order',()=>{
 const plan=buildCatalogPlan(inventory);
 assert.equal(plan.entries.length,16);
 const tierra=plan.entries.find(x=>x.slug==='tierra');
 assert.equal(tierra.data.price_cents,5000);
 assert.deepEqual(tierra.data.shopify_source.options[0].values,['S','M','L','XL']);
 const top=plan.entries.find(x=>x.slug==='top-tierra');assert.deepEqual(top.sizeCodes,['S','M','L']);
 const bottom=plan.entries.find(x=>x.slug==='braguita-curve');assert.deepEqual(bottom.sizeCodes,[]);
 assert.equal(bottom.data.shopify_source.options[0].values[0],'Default Title');
 assert.deepEqual(tierra.imageIds,['85397198569846','85397198438774','85397198471542','85397198537078','85397198602614','85400787747190','85400787779958']);
 assert.equal(plan.entries.find(x=>x.slug==='destello').data.available,false);
});
test('retains description text and Unicode without executing source markup',()=>{
 const blocks=portableTextFromHtml('<p>Suave &amp; cómodo</p><ul><li>90% poliamida</li></ul><script>bad()</script>');
 assert.equal(blocks.map(x=>x.children.map(s=>s.text).join('')).join('\n'),'Suave & cómodo\n90% poliamida');
});
test('refuses remote CMS targets and offsite/non-HTTPS media sources',()=>{
 assert.equal(assertLocalOrigin('http://localhost:4321'),'http://localhost:4321');
 for(const value of ['https://customseda.com','http://localhost.evil.test:4321','http://localhost:4321/path']) assert.throws(()=>assertLocalOrigin(value));
 assertShopifyAsset('https://cdn.shopify.com/s/files/1/a.jpg?v=1');
 for(const value of ['http://cdn.shopify.com/a.jpg','https://evil.test/a.jpg','https://cdn.shopify.com.evil.test/a.jpg']) assert.throws(()=>assertShopifyAsset(value));
});

test('verifies EmDash 1.3.1 media hashes without confusing them with manifest SHA-256',async()=>{
 const {verifyUploadedMedia}=await import('../scripts/import/shopify-plan.mjs');
 const bytes=Buffer.from('abc');
 const item={status:'ready',size:3,contentHash:'sha1:a9993e364706816aba3e25717850c26c9cd0d89d'};
 verifyUploadedMedia(item,bytes);
 assert.throws(()=>verifyUploadedMedia({...item,contentHash:'wrong'},bytes));
 assert.throws(()=>verifyUploadedMedia({...item,status:'pending'},bytes));
});
