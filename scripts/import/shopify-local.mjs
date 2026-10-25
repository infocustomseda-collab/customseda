import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {join,basename,extname} from 'node:path';
import {withDeploymentLock} from '../deploy/lock.mjs';
import {assertLocalOrigin,assertShopifyAsset,buildCatalogPlan,verifyUploadedMedia} from './shopify-plan.mjs';

const args=process.argv.slice(2);
if(args.some(x=>!['--apply','--dry-run'].includes(x))||args.length>1) throw new Error('Usage: pnpm import:shopify [--dry-run|--apply]');
const apply=args.includes('--apply');
const origin=assertLocalOrigin('http://localhost:4321');
const cache='backups/shopify-import-local';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const exec=promisify(execFile);
// Shopify accepts curl here but rate-limits Node's default HTTP client.
// Argument arrays avoid shell interpolation of source URLs.
async function sourceBytes(url) {
 const {stdout}=await exec('curl',['--fail','--silent','--show-error','--proto','=https','--max-time','60','--retry','2','--retry-delay','2',url],{encoding:'buffer',maxBuffer:21*1024*1024});
 return stdout;
}
const inventory=JSON.parse(await readFile('docs/import/shopify-public-inventory.json','utf8'));
const saveJson=async(path,data)=>{await writeFile(`${path}.tmp`,JSON.stringify(data,null,2)+'\n');await rename(`${path}.tmp`,path);};
const slug=value=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
let cookies='';
async function api(path,{method='GET',body,form}={}) {
 const res=await fetch(new URL(path,origin),{method,redirect:'error',headers:{Cookie:cookies,Origin:origin,'X-EmDash-Request':'1',...(!form&&body!==undefined?{'Content-Type':'application/json'}:{})},body:form??(body===undefined?undefined:JSON.stringify(body)),signal:AbortSignal.timeout(120000)});
 const data=await res.json().catch(()=>({}));
 if(!res.ok||data.success===false) throw new Error(`${path}: ${res.status} ${data.error?.message??data.error??'request failed'}`);
 return data.data;
}
async function all(collection) {
 const items=[];let cursor;
 do {const data=await api(`/_emdash/api/content/${collection}?limit=100${cursor?`&cursor=${encodeURIComponent(cursor)}`:''}`);items.push(...data.items);cursor=data.nextCursor;}while(cursor);
 return items;
}
async function refreshCatalog() {
 const raw=[];
 for(let page=1;;page++) {
  const data=JSON.parse((await sourceBytes(`https://www.customseda.com/products.json?limit=250&page=${page}`)).toString());
  raw.push(...data.products);if(data.products.length<250) break;
 }
 const audited=new Map(inventory.products.map(p=>[p.shopify_id,p]));
 inventory.products=raw.map(p=>{
  const old=audited.get(String(p.id));if(!old) throw new Error(`New unaudited source product ${p.handle}; refresh inventory before applying.`);
  return {...old,handle:p.handle,title:p.title,body_html:p.body_html,options:p.options,url:`https://www.customseda.com/products/${p.handle}`,
   variants:p.variants.map(v=>({shopify_id:String(v.id),options:[v.option1,v.option2,v.option3],price_cents:Number(v.price.replace('.','')),compare_at_price:v.compare_at_price,available_observed:v.available,sku:v.sku})),
   gallery:p.images.map((i,position)=>({shopify_image_id:String(i.id),source_url:i.src,position,alt:i.alt,width:i.width,height:i.height}))};
 });
 inventory.gallery_asset_manifest=[...new Map(inventory.products.flatMap(p=>p.gallery.map(g=>[g.shopify_image_id,g]))).values()];
 await saveJson(join(cache,'source.json'),inventory);
}
async function run() {
 await mkdir(cache,{recursive:true});
 if(!apply) {
  const plan=buildCatalogPlan(inventory);
  console.log(JSON.stringify({mode:'dry-run',target:origin,entries:plan.entries.map(p=>({collection:p.collection,slug:p.slug,price_cents:p.data.price_cents,sizes:p.sizeCodes,images:p.imageIds.length})),galleryImages:plan.assets.length,note:'Apply refreshes public products and imports drafts; no size inference or publication.'},null,2));return;
 }
 await refreshCatalog();
 const auth=await fetch(`${origin}/_emdash/api/auth/dev-bypass`,{redirect:'manual'});
 if(!auth.ok) throw new Error('Start pnpm dev and apply the local catalog model first.');
 cookies=auth.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');
 if(!cookies) throw new Error('No local development session returned.');
 await api('/_emdash/api/customseda/import',{method:'POST',body:{operation:'schema'}});
 const lookups={};
 for(const c of ['categories','collections','sizes']) for(const p of await all(c)) lookups[p.data.code]=p.id;
 for(const code of ['top','braguita','margarita','XS','S','M','L','XL']) if(!lookups[code]) throw new Error(`Missing catalog lookup ${code}. Run pnpm cms:model first.`);
 let mediaMap={};try {mediaMap=JSON.parse(await readFile(join(cache,'media.json'),'utf8'));} catch(e) {if(e.code!=='ENOENT') throw e;}
 const report={target:origin,startedAt:new Date().toISOString(),catalog:[],supporting:[],media:[],warnings:[],mode:'drafts-only'};
 const persist=()=>saveJson(join(cache,'report.json'),report);
 async function media(asset) {
  const url=assertShopifyAsset(asset.source_url??asset.src);url.searchParams.delete('width');url.searchParams.delete('height');url.searchParams.delete('crop');
  const key=url.toString();
  if(mediaMap[key]) {
   const found=await api(`/_emdash/api/media/${mediaMap[key].id}`).catch(()=>null);
   if(found?.item?.status==='ready'&&found.item.contentHash===mediaMap[key].contentHash) {report.media.push({source:key,...mediaMap[key],reused:true});return mediaMap[key];}
  }
  const path=join(cache,`${hash(key)}${extname(url.pathname)||'.img'}`);
  let bytes;try {bytes=await readFile(path);} catch(e) {
   if(e.code!=='ENOENT') throw e;
   bytes=await sourceBytes(key);if(bytes.length>20*1024*1024) throw new Error('Source image exceeds 20 MiB.');
   await writeFile(path,bytes);
  }
  const extension=extname(url.pathname).toLowerCase();const type=extension==='.png'?'image/png':extension==='.webp'?'image/webp':'image/jpeg';
  const form=new FormData();form.set('file',new Blob([bytes],{type}),basename(url.pathname));
  if(asset.width&&asset.height) {form.set('width',String(asset.width));form.set('height',String(asset.height));}
  if(asset.alt) form.set('alt',asset.alt);
  const uploaded=await api('/_emdash/api/media',{method:'POST',form});
  const item=uploaded.item;
  verifyUploadedMedia(item,bytes);
  const value={id:item.id,url:item.url??`/_emdash/api/media/file/${item.storageKey}`,provider:'local',filename:item.filename,mimeType:item.mimeType,contentHash:item.contentHash,sha256:hash(bytes),size:bytes.length};
  mediaMap[key]=value;await saveJson(join(cache,'media.json'),mediaMap);
  report.media.push({source:key,...value,reused:Boolean(uploaded.deduplicated)});
  console.log(`Media ${report.media.length}: ${value.filename}`);return value;
 }
 async function draft(entry,section='catalog') {
  const result=await api('/_emdash/api/customseda/import',{method:'POST',body:entry});
  report[section].push({collection:entry.collection,slug:entry.slug,source_key:entry.data.shopify_source.source_key,...result});
  if(entry.collection==='colors' && result.created) await api(`/_emdash/api/content/colors/${result.id}/publish`,{method:'POST',body:{}});
  await persist();console.log(`${result.created?'Imported':'Retained'} ${entry.collection}/${entry.slug}`);return result.id;
 }
 const plan=buildCatalogPlan(inventory),imageMap={};
 for(const asset of plan.assets) imageMap[asset.shopify_image_id]=await media(asset);
 const colors={};
 for(const color of new Set(plan.entries.map(x=>x.color))) {
  colors[color]=await draft({collection:'colors',slug:slug(color),data:{title:color,code:slug(color),shopify_source:{source_key:`color:${slug(color)}`,label:color}}},'supporting');
  // Reference readers use published lookup values even while catalog entries
  // remain drafts. Publish only these simple source color labels locally.
  const colorEntry=await api(`/_emdash/api/content/colors/${colors[color]}`);
  if(colorEntry.item.status!=='published') throw new Error(`Imported color ${color} is an existing draft; inspect it before resuming. Existing editorial drafts are never auto-published.`);
 }
 const imported={};
 for(const entry of [...plan.entries.filter(x=>x.collection==='products'),...plan.entries.filter(x=>x.collection==='conjuntos')]) {
  const {color,category,sizeCodes,imageIds,componentHandles,...payload}=entry;
  payload.data.gallery=imageIds.map((id,i)=>{const m=imageMap[id];return {image:{id:m.id,provider:'local',url:m.url,filename:m.filename,mimeType:m.mimeType},alt:entry.data.shopify_source.gallery[i].alt||`${entry.data.title} — ${color}, imagen ${i+1}`};});
  if(entry.collection==='products') payload.references={category:[lookups[category]],collection:[lookups.margarita],color:[colors[color]],sizes:sizeCodes.map(s=>lookups[s])};
  else {
   if(!componentHandles||!imported[componentHandles.top]||!imported[componentHandles.braguita]) throw new Error(`Missing bundle components: ${entry.slug}`);
   payload.references={top:[imported[componentHandles.top]],bottom:[imported[componentHandles.braguita]]};
   payload.data.shopify_source.component_mapping={...componentHandles,note:'Inferred from public page names, colors and galleries; retained as a draft.'};
  }
  imported[entry.slug]=await draft(payload);
 }
 const support=inventory.pages.filter(p=>p.capture.startsWith('page-')||p.capture==='blog-noticias.html'||p.capture==='policy-privacy-policy.html');
 for(const page of support) {
  const blocks=page.main_text.split('\n').filter(Boolean).map((text,i)=>({_type:'block',_key:`p${i}`,style:'normal',markDefs:[],children:[{_type:'span',_key:`s${i}`,text,marks:[]}]}));
  for(const asset of page.main_images??[]) {
   if(!/\.(png|jpe?g|webp)(\?|$)/i.test(asset.src)) continue;
   const m=await media(asset);blocks.push({_type:'image',_key:`image${blocks.length}`,asset:{id:m.id,provider:'local',url:m.url,filename:m.filename,mimeType:m.mimeType},alt:asset.alt||page.og_title});
  }
  const source={source_key:`page:${new URL(page.canonical).pathname}`,url:page.canonical,capture:page.capture,original_text:page.main_text,metadata:{title:page.title,description:page.meta_description},images:page.main_images,links:page.links};
  const pageSlug=new URL(page.canonical).pathname.split('/').pop();
  await draft({collection:'pages',slug:pageSlug,data:{title:page.og_title,content:blocks,shopify_source:source},seo:{title:page.og_title,...(page.meta_description?{description:page.meta_description}:{})}},'supporting');
  if(pageSlug==='guia-de-tallas') await draft({collection:'size_guides',slug:'guia-de-tallas',data:{title:page.og_title,content:blocks,shopify_source:{...source,source_key:'size-guide:guia-de-tallas'}}},'supporting');
 }
 const home=inventory.pages.find(p=>p.capture==='home.html');
 const homeMedia=[];
 for(const asset of home.main_images??[]) homeMedia.push(await media(asset));
 for(const collection of inventory.collections) if(collection.image?.src) await media(collection.image);
 const hero=homeMedia[0]??null;
 await draft({collection:'site_settings',slug:'shopify-home',data:{title:'Seda — contenido actual',hero_title:'MARGARITA',hero_text:'Inspirada en la energía de Las Canteras',hero_link:'https://www.customseda.com/collections/bikinis',...(hero?{hero_image:{id:hero.id,provider:'local',url:hero.url}}:{}),contact_email:'info.customseda@gmail.com',instagram_url:'https://www.instagram.com/customseda/',shopify_source:{source_key:'site:home',url:home.canonical,original_text:home.main_text,images:home.main_images,links:home.links,collections:inventory.collections}}},'supporting');
 report.completedAt=new Date().toISOString();report.counts={catalog:report.catalog.length,products:report.catalog.filter(x=>x.collection==='products').length,conjuntos:report.catalog.filter(x=>x.collection==='conjuntos').length,supporting:report.supporting.length,mediaSourceUrls:Object.keys(mediaMap).length};
 await persist();console.log(JSON.stringify(report.counts));
}
await withDeploymentLock('.superpowers/shopify-import','local',run);
