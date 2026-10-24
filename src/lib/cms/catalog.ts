/** Shop rules shared by CMS policies and the later checkout/snapshot pipeline. */
export type CatalogEntry = {
 id: string;
 type: string;
 status: string;
 data: Record<string, unknown>;
 refs: Record<string, string[]>;
 group?: string;
};
export type CatalogEntries = ReadonlyMap<string, CatalogEntry>;
export const catalogTypes = new Set(['products','conjuntos','categories','collections','colors','sizes','size_guides','site_settings','popups','shipping_rules']);
export const sizeCodes = ['XS','S','M','L','XL'];
export function mainImage(gallery: unknown): Record<string, unknown> | null {
 if (!Array.isArray(gallery)) return null;
 return gallery[0]?.image ?? null;
}
export function bundleAvailable(bundle: CatalogEntry, top: CatalogEntry, bottom: CatalogEntry): boolean {
 return [bundle,top,bottom].every(e => e.status === 'published' && e.data.available !== false);
}
const money = (n: unknown) => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
export function validateCatalogEntry(entry: CatalogEntry, entries: CatalogEntries, {publish=false,references=true}: {publish?:boolean;references?:boolean}={}): string[] {
 const errors: string[]=[];
 const {type,data,refs}=entry;
 const fail=(message:string)=>errors.push(message);
 const ref=(field:string,target:string,many=false):CatalogEntry[]=>{
  const ids=refs[field]??[];
  if (!ids.length || (!many && ids.length!==1) || new Set(ids).size!==ids.length) fail(`${field}: selecciona ${many?'una o más opciones diferentes':'exactamente una opción'}.`);
  return ids.flatMap(id=>{
   const value=entries.get(id);
   if(!value || value.type!==target || value.status==='trash') {fail(`${field}: referencia no válida.`);return [];}
   if(publish && value.status!=='published') fail(`${field}: publica primero el contenido relacionado.`);
   return [value];
  });
 };
 if(type==='categories' && !['top','braguita'].includes(String(data.code))) fail('Categoría: el código debe ser top o braguita.');
 if(type==='sizes' && !sizeCodes.includes(String(data.code))) fail('Talla: el código debe ser XS, S, M, L o XL.');
 if(type==='products'||type==='conjuntos') {
  if((publish || data.price_cents!==undefined) && !money(data.price_cents)) fail('El precio debe ser un entero en céntimos EUR, mayor o igual a cero.');
  if(data.available!==undefined && typeof data.available!=='boolean') fail('Disponibilidad: usa Sí o No.');
  const gallery=data.gallery;
  if(publish && (!Array.isArray(gallery)||!gallery.length)) fail('Añade al menos una imagen a la galería.');
  if(gallery!==undefined && !Array.isArray(gallery)) fail('Galería no válida.');
  if(Array.isArray(gallery)) {
   if(gallery.length>24) fail('La galería admite un máximo de 24 imágenes.');
   for(const row of gallery) {
    if(!row || typeof row!=='object' || !row.image || typeof row.image.id!=='string' || !row.image.id.trim()) fail('Cada imagen debe estar en la biblioteca de medios.');
    if(!row || typeof row.alt!=='string'||!row.alt.trim()) fail('Cada imagen necesita texto alternativo.');
    for(const key of ['focal_x','focal_y']) if(row?.[key]!=null && (typeof row[key]!=='number'||!Number.isFinite(row[key])||row[key]<0||row[key]>1)) fail('El punto focal debe estar entre 0 y 1.');
   }
  }
 }
 if(type==='products' && references) {
  const [category]=ref('category','categories');ref('collection','collections');ref('color','colors');
  const sizes=ref('sizes','sizes',true);
  if(refs.size_guide?.length) ref('size_guide','size_guides');
  if(category?.data.code==='top' && sizes.some(s=>s.data.code==='XS')) fail('Top admite tallas S, M, L y XL; XS solo está disponible para Braguita.');
 } else if(type==='conjuntos' && references) {
  const [top]=ref('top','products'), [bottom]=ref('bottom','products');
  if(['sizes','size','category','color','collection'].some(key=>(refs[key]?.length??0)>0 || data[key]!=null)) fail('El conjunto hereda color y colección; las dos tallas se eligen por separado al comprar.');
  if(top && bottom) {
   const code=(e:CatalogEntry)=>entries.get(e.refs.category?.[0]??'')?.data.code;
   if(top.id===bottom.id || top.id===entry.id || bottom.id===entry.id) fail('Selecciona dos productos diferentes.');
   if(code(top)!=='top') fail('El componente Top debe pertenecer a la categoría Top.');
   if(code(bottom)!=='braguita') fail('El componente Braguita debe pertenecer a la categoría Braguita.');
   for(const field of ['color','collection']) if(!top.refs[field]?.[0] || top.refs[field][0]!==bottom.refs[field]?.[0]) fail(`Los componentes deben compartir ${field==='color'?'color':'colección'}.`);
  }
 }
 if(type==='popups') {
  const start=data.starts_at,end=data.ends_at;
  if(start && end && new Date(String(start))>=new Date(String(end))) fail('La fecha final debe ser posterior a la inicial.');
 }
 if(type==='shipping_rules') {
  if(data.price_cents!=null&&!money(data.price_cents)) fail('El precio de envío debe estar en céntimos EUR.');
  if(data.free_above_cents!=null&&!money(data.free_above_cents)) fail('El umbral de envío gratuito debe estar en céntimos EUR.');
 }
 return errors;
}
