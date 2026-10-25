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
export const decode=text=>text.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,(all,key)=>{
 if(key.startsWith('#')) {const n=key[1].toLowerCase()==='x'?parseInt(key.slice(2),16):Number(key.slice(1));return n>0&&n<=0x10ffff?String.fromCodePoint(n):all;}
 return {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '}[key.toLowerCase()]??all;
});
const attr=(attrs,name)=>decode(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`,'i').exec(attrs)?.slice(1).find(x=>x!==undefined)??'');
// Source HTML is also retained verbatim in shopify_source. Convert its structure (headings,
// lists, bold/italic, links) into editor blocks; scripts/styles never become active content.
// The top body heading becomes h2 (the page title is the h1); images need an `image` resolver.
export function portableTextFromHtml(html,{image}={}) {
 html=html.replace(/<!--[\s\S]*?-->/g,'').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,'');
 const levels=[...html.matchAll(/<h([1-6])\b/gi)].map(m=>Number(m[1]));
 const base=levels.length?Math.min(...levels):2;
 const blocks=[],lists=[],marks=[],links=[];let current=null;
 const start=(style,list)=>{current={_type:'block',style,markDefs:[],children:[],...(list?{listItem:list.type,level:lists.length}:{})};};
 const flush=()=>{
  if(!current) return;
  const spans=current.children;
  if(spans.length) {spans[0].text=spans[0].text.trimStart();spans.at(-1).text=spans.at(-1).text.trimEnd();}
  const children=spans.filter(s=>s.text);
  if(children.length) {
   const i=blocks.length,used=new Set(children.flatMap(s=>s.marks));
   blocks.push({...current,_key:`p${i}`,markDefs:current.markDefs.filter(d=>used.has(d._key)),children:children.map((s,j)=>({_type:'span',_key:`s${i}_${j}`,text:s.text,marks:s.marks}))});
  }
  current=null;
 };
 for(const [,closing,tag,attrs,raw] of html.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*)>|([^<]+)/g)) {
  const name=tag?.toLowerCase();
  if(raw!==undefined) {
   const text=decode(raw).replace(/\s+/g,' ');
   if(!current) {if(!text.trim()) continue;start('normal',lists.at(-1));}
   const last=current.children.at(-1);
   if(last&&last.marks.join()===marks.join()) last.text+=text;else current.children.push({text,marks:[...marks]});
  } else if(/^h[1-6]$/.test(name)||name==='p') {
   flush();if(!closing) start(name==='p'?'normal':`h${Math.min(4,2+Number(name[1])-base)}`);
  } else if(name==='li') {
   flush();if(!closing) start('normal',lists.at(-1)??{type:'bullet'});
  } else if(name==='ul'||name==='ol') {
   flush();if(closing) lists.pop();else lists.push({type:name==='ol'?'number':'bullet'});
  } else if(name==='br') {
   const {style,listItem,level}=current??{};flush();if(style) current={_type:'block',style,markDefs:[],children:[],...(listItem?{listItem,level}:{})};
  } else if(['strong','b','em','i'].includes(name)) {
   const mark=name==='strong'||name==='b'?'strong':'em';
   if(!closing) marks.push(mark);else {const at=marks.lastIndexOf(mark);if(at>=0) marks.splice(at,1);}
  } else if(name==='a') {
   if(closing) {const key=links.pop();if(key) marks.splice(marks.lastIndexOf(key),1);continue;}
   const href=attr(attrs,'href').trim();
   if(!href) {links.push(null);continue;}
   if(!current) start('normal',lists.at(-1));
   const key=`l${blocks.length}_${current.markDefs.length}`;
   current.markDefs.push({_type:'link',_key:key,href});marks.push(key);links.push(key);
  } else if(name==='img'&&!closing) {
   flush();
   const resolved=image?.(attr(attrs,'src'),attr(attrs,'alt'));
   if(resolved) blocks.push({...resolved,_key:`image${blocks.length}`});
  } else if(['div','section','figure','blockquote','table','tr'].includes(name)) flush();
 }
 flush();
 return blocks;
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
