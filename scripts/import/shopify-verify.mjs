import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {assertLocalOrigin} from './shopify-plan.mjs';
const origin=assertLocalOrigin('http://localhost:4321');
const root='backups/shopify-import-local';
const source=JSON.parse(await readFile(`${root}/source.json`,'utf8'));
const report=JSON.parse(await readFile(`${root}/report.json`,'utf8'));
const media=JSON.parse(await readFile(`${root}/media.json`,'utf8'));
const auth=await fetch(`${origin}/_emdash/api/auth/dev-bypass`,{redirect:'manual'});
assert.ok(auth.ok);const cookies=auth.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');assert.ok(cookies);
async function get(path) {const r=await fetch(new URL(path,origin),{headers:{Cookie:cookies},redirect:'error'});assert.ok(r.ok,`${r.status} ${path}`);const value=await r.json();assert.notEqual(value.success,false);return value.data;}
const details=[];
for(const result of report.catalog) {
 const {item}=await get(`/_emdash/api/content/${result.collection}/${result.id}`);
 const original=source.products.find(x=>`product:${x.shopify_id}`===result.source_key);assert.ok(original);
 assert.equal(item.status,'draft');assert.equal(item.locale,'es');assert.equal(item.slug,original.handle);
 assert.equal(item.data.title,original.title);assert.equal(item.data.shopify_id,original.shopify_id);
 assert.equal(item.data.price_cents,original.variants[0].price_cents);
 assert.equal(Boolean(item.data.available),original.variants.some(v=>v.available_observed));
 assert.deepEqual(item.data.shopify_source.options,original.options);
 assert.deepEqual(item.data.shopify_source.variants,original.variants);
 assert.equal(item.data.shopify_source.body_html,original.body_html);
 assert.equal(item.data.gallery.length,original.gallery.length);
 for(let i=0;i<original.gallery.length;i++) assert.equal(item.data.gallery[i].image.id,media[original.gallery[i].source_url].id);
 if(result.collection==='products') {
  const expectedSizes=original.options.find(o=>o.name.toLowerCase().includes('talla'))?.values??[];
  assert.deepEqual(item.references.sizes.children.map(x=>x.title),expectedSizes);
  assert.equal(item.references.category.children.length,1);
  assert.equal(item.references.collection.children.length,1);
  assert.equal(item.references.color.children.length,1);
 } else {
  const mapping=source.proposed_bundle_links.find(x=>x.conjunto===original.handle);
  assert.equal(item.references.top.children[0].slug,mapping.top);
  assert.equal(item.references.bottom.children[0].slug,mapping.braguita);
 }
 details.push({id:item.id,collection:result.collection,slug:item.slug,status:item.status,locale:item.locale,source_key:result.source_key,price_cents:item.data.price_cents,source_options:item.data.shopify_source.options,galleryImages:item.data.gallery.length,validationErrors:result.validationErrors});
}
assert.equal(details.length,source.products.length);
assert.equal(new Set(details.map(x=>x.id)).size,details.length);
let mediaBytes=0;const checked=new Set();
for(const value of Object.values(media)) {
 if(checked.has(value.id)) continue;
 const {item}=await get(`/_emdash/api/media/${value.id}`);assert.equal(item.status,'ready');
 assert.equal(item.contentHash,value.contentHash);assert.equal(item.size,value.size);
 const response=await fetch(new URL(value.url,origin),{headers:{Cookie:cookies},redirect:'error'});assert.ok(response.ok);
 const bytes=Buffer.from(await response.arrayBuffer());assert.equal(createHash('sha256').update(bytes).digest('hex'),value.sha256);
 checked.add(value.id);mediaBytes+=bytes.length;
}
for(const value of report.supporting) {
 const {item}=await get(`/_emdash/api/content/${value.collection}/${value.id}`);
 assert.equal(item.status,value.collection==='colors'?'published':'draft');assert.equal(item.locale,'es');assert.equal(item.data.shopify_source.source_key,value.source_key);
}
const summary={verifiedAt:new Date().toISOString(),target:origin,counts:{catalog:details.length,products:details.filter(x=>x.collection==='products').length,conjuntos:details.filter(x=>x.collection==='conjuntos').length,supporting:report.supporting.length,mediaSourceUrls:Object.keys(media).length,distinctLocalMedia:checked.size,mediaBytes},catalog:details};
await writeFile(`${root}/verification.json`,JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify(summary.counts));
console.log('Verified catalog identity, prices, descriptions, options, variants, gallery ordering, Spanish drafts, supporting records, and every local media blob SHA-256.');
