// Re-converts imported content pages from the saved storefront captures, keeping headings,
// lists, emphasis, links and image order. Only pages still identical to the flat first import
// are rewritten; anything an editor has touched is reported and left alone. Local only.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {withDeploymentLock} from '../deploy/lock.mjs';
import {assertLocalOrigin,portableTextFromHtml} from './shopify-plan.mjs';
import {isUneditedImport,linkContacts,mainHtmlFromCapture} from './page-structure.mjs';

const args=process.argv.slice(2);
if(args.some(x=>!['--apply','--dry-run'].includes(x))||args.length>1) throw new Error('Usage: pnpm import:pages [--dry-run|--apply]');
const apply=args.includes('--apply');
const origin=assertLocalOrigin('http://localhost:4321');
const captures='backups/shopify-public-2026-10-25';
const out='backups/page-structure';
// Pages rendered by ContentPage. Margarita keeps its story layout; the size guide and contact have no text structure.
const pages=['envios-y-devoluciones','noticias','privacy-policy','conjuntos'];

let cookies='';
async function api(path,{method='GET',body}={}) {
 const res=await fetch(new URL(path,origin),{method,redirect:'error',headers:{Cookie:cookies,Origin:origin,'X-EmDash-Request':'1',...(body!==undefined?{'Content-Type':'application/json'}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(60000)});
 const data=await res.json().catch(()=>({}));
 if(!res.ok||data.success===false) throw new Error(`${path}: ${res.status} ${data.error?.message??data.error??'request failed'}`);
 return data.data;
}

async function run() {
 const auth=await fetch(`${origin}/_emdash/api/auth/dev-bypass`,{redirect:'manual'});
 if(!auth.ok) throw new Error('Start pnpm dev first.');
 cookies=auth.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');
 const mediaMap=JSON.parse(await readFile('backups/shopify-import-local/media.json','utf8'));
 const listed=await api('/_emdash/api/content/pages?limit=100');
 await mkdir(out,{recursive:true});
 const report=[];
 for(const slug of pages) {
  const summary=listed.items.find(x=>x.slug===slug);
  if(!summary) {report.push({slug,result:'missing'});continue;}
  const {item,_rev}=await api(`/_emdash/api/content/pages/${summary.id}`);
  const source=item.data.shopify_source;
  const html=await readFile(join(captures,source.capture),'utf8');
  const image=(src,alt)=>{
   const url=new URL(src,'https://www.customseda.com');url.protocol='https:';
   for(const key of ['width','height','crop']) url.searchParams.delete(key);
   const m=mediaMap[url.toString()];
   return m?{_type:'image',asset:{id:m.id,provider:'local',url:m.url,filename:m.filename,mimeType:m.mimeType},alt:alt||item.data.title}:null;
  };
  const content=linkContacts(portableTextFromHtml(mainHtmlFromCapture(html),{image}));
  await writeFile(join(out,`${slug}.json`),JSON.stringify({slug,before:item.data.content,after:content},null,2)+'\n');
  const unedited=isUneditedImport(item.data.content,source.original_text);
  const counts={blocks:content.length,headings:content.filter(b=>/^h\d$/.test(b.style)).length,listItems:content.filter(b=>b.listItem).length,links:content.flatMap(b=>b.markDefs??[]).length,images:content.filter(b=>b._type==='image').length};
  if(!unedited) {report.push({slug,result:'skipped: edited since import',...counts});continue;}
  if(apply) await api(`/_emdash/api/content/pages/${item.id}`,{method:'PUT',body:{data:{...item.data,content},_rev}});
  report.push({slug,result:apply?'restored':'would restore',...counts});
 }
 console.log(JSON.stringify({mode:apply?'apply':'dry-run',target:origin,preview:out,pages:report},null,2));
}
await withDeploymentLock('.superpowers/shopify-import','local',run);
