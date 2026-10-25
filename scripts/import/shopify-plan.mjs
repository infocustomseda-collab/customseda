import {createHash} from 'node:crypto';
const sizes=new Set(['XS','S','M','L','XL']);
export function verifyUploadedMedia(item,bytes) {
 const expected=`sha1:${createHash('sha1').update(bytes).digest('hex')}`;
 if(item.status!=='ready'||item.size!==bytes.length||item.contentHash!==expected) throw new Error('Uploaded media did not confirm matching ready bytes.');
}
export function assertLocalOrigin(value) {
 const url=new URL(value);
 if(url.protocol!=='http:'||!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||url.pathname!=='/'||url.search||url.hash||url.username||url.password) throw new Error('Only a loopback HTTP CMS origin is allowed.');
 return url.origin;
}
export function assertShopifyAsset(value) {
 const url=new URL(value);
 const allowed=url.hostname==='cdn.shopify.com'||(url.hostname==='www.customseda.com'&&url.pathname.startsWith('/cdn/shop/'));
 if(url.protocol!=='https:'||!allowed||url.username||url.password) throw new Error('Only original HTTPS Shopify storefront assets are allowed.');
 return url;
}
const decode=text=>text.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,(all,key)=>{
 if(key.startsWith('#')) {const n=key[1].toLowerCase()==='x'?parseInt(key.slice(2),16):Number(key.slice(1));return n>0&&n<=0x10ffff?String.fromCodePoint(n):all;}
 return {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '}[key.toLowerCase()]??all;
});
export function portableTextFromHtml(html) {
 // Source HTML is also retained verbatim in shopify_source. Import plain text
 // blocks into the editor; source scripts/styles never become active content.
 return html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,'').replace(/<\/(p|div|li|h[1-6])\s*>|<br\s*\/?>/gi,'\n').split('\n').map(line=>decode(line.replace(/<[^>]*>/g,'')).trim()).filter(Boolean).map((text,i)=>({_type:'block',_key:`p${i}`,style:'normal',markDefs:[],children:[{_type:'span',_key:`s${i}`,text,marks:[]}]}));
}
export function buildCatalogPlan(inventory) {
 const ids=new Set();
 const entries=inventory.products.map(p=>{
  if(ids.has(p.shopify_id)) throw new Error('Duplicate source product ID.');ids.add(p.shopify_id);
  const prices=[...new Set(p.variants.map(v=>v.price_cents))];
  if(prices.length!==1||!Number.isSafeInteger(prices[0])||prices[0]<0) throw new Error(`Unsupported variable/invalid source price: ${p.handle}`);
  for(const g of p.gallery) assertShopifyAsset(g.source_url);
  const page=inventory.pages.find(page=>page.canonical===p.url);
  return {collection:p.observed_kind==='conjunto'?'conjuntos':'products',slug:p.handle,
   data:{title:p.title,description:portableTextFromHtml(p.body_html??''),price_cents:prices[0],available:p.variants.some(v=>v.available_observed),shopify_id:p.shopify_id,
    shopify_source:{source_key:`product:${p.shopify_id}`,url:p.url,body_html:p.body_html,options:p.options,variants:p.variants,gallery:p.gallery,visible_color:p.color_label_from_page,intro:page?.product_intro_text,seo:page?{title:page.title,description:page.meta_description}:null}},
   color:p.color_label_from_page,category:p.observed_kind,
   sizeCodes:p.observed_kind==='conjunto'?[]:(p.options.find(o=>o.name.toLowerCase().includes('talla'))?.values??[]).filter(s=>sizes.has(s)),
   imageIds:p.gallery.map(g=>g.shopify_image_id),
   seo:page?{title:p.title,...(page.meta_description?{description:page.meta_description}:{})}:undefined,
   componentHandles:inventory.proposed_bundle_links.find(x=>x.conjunto===p.handle),
  };
 });
 return {entries,assets:inventory.gallery_asset_manifest};
}
