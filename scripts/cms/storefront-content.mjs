// Local only: fills the customseda.storefront.v1 homepage fields from the audited Shopify homepage and
// restores the Margarita page's source order (text rows between photo rows). Re-running is idempotent.
// Requires `pnpm dev` and `pnpm cms:model`. Writes drafts through EmDash's REST API and validators.
const origin='http://localhost:4321';

export const homepage={
 featured:'tierra',
 slideshow:['N3A6591.jpg','N3A6628.jpg','N3A6517.jpg','N3A6788.jpg','N3A6447_e05dc5e4-d747-47cf-a92e-0e30a619f200.jpg'],
 introTitle:'Primera colección',
 // Source: rich_text_H3AiQD on the Shopify homepage, bold run preserved.
 introText:[{_type:'block',_key:'intro0',style:'normal',markDefs:[],children:[
  {_type:'span',_key:'s0',text:'Nace de la idea de crear un bikini diferente: uno con el que las mujeres se sientan ',marks:[]},
  {_type:'span',_key:'s1',text:'seguras, cómodas y atractivas',marks:['strong']},
  {_type:'span',_key:'s2',text:' mientras practican deporte en la playa.',marks:[]},
 ]}],
 highlights:[
  {file:'IMG_1639.jpg',title:'El patrón',text:'Todo empieza en el papel. Creamos los patrones pensando en cómo se adapta el bikini al cuerpo y en cómo se mueve cuando practicas deporte.'},
  {file:'IMG_5018.jpg',title:'La costura',text:'Cada pieza pasa por nuestras manos. Cortamos, cosemos y revisamos cada detalle antes de que llegue a ti.'},
  {file:'IMG_5022.jpg',title:'El tejido',text:'Elegimos el tejido buscando ese equilibrio entre comodidad, sujeción y libertad de movimiento.'},
 ],
 tiktok:'https://www.tiktok.com/@customseda',
 announcement:'🌼 ¡ENVÍO GRATIS! En compras superiores a 45€ en Canarias - 70€ en Península - 90€ Europa',
};

// Recreates the source site's free-shipping popup (a Hoppy app image) as editable text.
export const popup={slug:'envio-gratis',data:{title:'Envío gratis',enabled:true,delay_seconds:3,dismiss_days:7,
 button_text:'Ver bikinis',button_url:'/collections/bikinis',
 content:[
  ['Canarias: compras superiores a 45 €','l0'],['Península: compras superiores a 70 €','l1'],['Europa: compras superiores a 90 €','l2'],['Tu conjunto, sin gastos de envío.','l3'],
 ].map(([text,key])=>({_type:'block',_key:key,style:'normal',markDefs:[],children:[{_type:'span',_key:`${key}s`,text,marks:[]}]})),
}};

// Source header and footer links; paths keep the Shopify URLs (see docs/import/shopify-url-map.json).
export const menus={
 primary:{label:'Principal',items:[['Inicio','/'],['Bikinis','/collections/bikinis'],['Colección','/pages/margarita'],['Sobre Seda','/blogs/noticias'],['Envíos y Devoluciones','/pages/envios-y-devoluciones'],['Contacto','/pages/contact']]},
 footer:{label:'Pie de página',items:[['Envíos y Devoluciones','/pages/envios-y-devoluciones'],['Guía de tallas','/pages/guia-de-tallas'],['Contacto','/pages/contact'],['Política de privacidad','/policies/privacy-policy']]},
};

/** Source order of the Margarita page: heading, intro, then 3 photos before each paragraph, then the CTA. */
export function margaritaOrder(blocks) {
 const text=blocks.filter(b=>b._type==='block');
 const images=blocks.filter(b=>b._type==='image');
 // Imported order is all text then all photos; anything else was already ordered or edited.
 if(text.length!==6||images.length!==12||blocks.slice(0,6).some(b=>b._type!=='block')) return null;
 const [heading,intro,first,second,third,cta]=text;
 const ctaText=cta.children.map(c=>c.text).join('');
 return [
  {...heading,style:'h2'},intro,
  ...images.slice(0,3),first,...images.slice(3,6),second,...images.slice(6,9),third,...images.slice(9,12),
  {...cta,markDefs:[{_type:'link',_key:'cta',href:'/collections/bikinis'}],children:[{_type:'span',_key:`${cta._key}s`,text:ctaText,marks:['cta']}]},
 ];
}

async function main() {
 const auth=await fetch(`${origin}/_emdash/api/auth/dev-bypass`,{redirect:'manual'});
 if(!auth.ok) throw new Error('Start pnpm dev, then retry.');
 const cookie=auth.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
 const api=async (path,init={})=>{
  const response=await fetch(`${origin}${path}`,{...init,headers:{Cookie:cookie,Origin:origin,'X-EmDash-Request':'1','Content-Type':'application/json',...init.headers}});
  const body=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(`${init.method??'GET'} ${path} → ${response.status} ${JSON.stringify(body.error??body).slice(0,300)}`);
  return body.data??body;
 };
 const media=new Map();
 for(let cursor;;) {
  const page=await api(`/_emdash/api/media?limit=100${cursor?`&cursor=${encodeURIComponent(cursor)}`:''}`);
  for(const item of page.items??[]) media.set(item.filename,item);
  if(!page.nextCursor) break;
  cursor=page.nextCursor;
 }
 const image=file=>{
  const m=media.get(file);
  if(!m) throw new Error(`Local media missing: ${file}. Run pnpm import:shopify --apply first.`);
  return {id:m.id,provider:'local',url:m.url??`/_emdash/api/media/file/${m.storageKey}`,filename:m.filename,mimeType:m.mimeType};
 };
 const tierra=(await api(`/_emdash/api/content/conjuntos/${homepage.featured}`)).item;
 const settings=(await api('/_emdash/api/content/site_settings/shopify-home')).item;
 await api(`/_emdash/api/content/site_settings/${settings.id}`,{method:'PUT',body:JSON.stringify({
  data:{
   slideshow:homepage.slideshow.map((file,i)=>({image:image(file),alt:`Colección Margarita, foto de campaña ${i+1}`})),
   intro_title:homepage.introTitle,intro_text:homepage.introText,
   highlights:homepage.highlights.map(h=>({image:image(h.file),alt:h.title,title:h.title,text:h.text})),
   tiktok_url:homepage.tiktok,
   announcement_enabled:true,announcement_text:homepage.announcement,
  },
  references:{featured_conjunto:[tierra.id]},
 })});
 const page=(await api('/_emdash/api/content/pages/margarita')).item;
 const ordered=margaritaOrder(page.data.content);
 if(ordered) await api(`/_emdash/api/content/pages/${page.id}`,{method:'PUT',body:JSON.stringify({data:{content:ordered}})});
 const existing=new Set((await api('/_emdash/api/menus')).map(m=>m.name));
 for(const [name,menu] of Object.entries(menus)) {
  if(!existing.has(name)) await api('/_emdash/api/menus',{method:'POST',body:JSON.stringify({name,label:menu.label})});
  const current=(await api(`/_emdash/api/menus/${name}`)).items??[];
  const same=current.length===menu.items.length&&current.every((item,i)=>item.label===menu.items[i][0]&&item.customUrl===menu.items[i][1]);
  if(same) continue;
  for(const item of current) await api(`/_emdash/api/menus/${name}/items/${item.id}`,{method:'DELETE'});
  for(const [i,[label,customUrl]] of menu.items.entries()) await api(`/_emdash/api/menus/${name}/items`,{method:'POST',body:JSON.stringify({type:'custom',label,customUrl,sortOrder:i})});
 }
 const existingPopup=await api(`/_emdash/api/content/popups/${popup.slug}`).catch(()=>null);
 if(!existingPopup) await api('/_emdash/api/content/popups',{method:'POST',body:JSON.stringify({slug:popup.slug,status:'draft',locale:'es',data:popup.data})});
 console.log(`Homepage fields filled on ${settings.slug}; Margarita ${ordered?'reordered':'already in source order or edited — left unchanged'}. Local drafts only.`);
}

if(import.meta.url===`file://${process.argv[1]}`) main().catch(error=>{console.error(error.message,error.cause?.code??"");process.exitCode=1;});
