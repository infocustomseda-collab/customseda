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
export const catalogTypes = new Set(['products','collections','colors','materials','sizes','size_guides','site_settings','popups','shipping_rules']);
/** Shopper-facing size labels. Each size record belongs to one category; its code stays unique. */
export const sizeLabels = ['XS','S','M','L','XL'];
export function mainImage(gallery: unknown): Record<string, unknown> | null {
 if (!Array.isArray(gallery)) return null;
 return gallery[0]?.image ?? null;
}
export function bundleAvailable(bundle: CatalogEntry, ...components: CatalogEntry[]): boolean {
 return [bundle,...components].every(e => e.status === 'published' && e.data.available !== false);
}
const money = (n: unknown) => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
// materials: the material rules (one material, pieces in the conjunto's material). Off when a conjunto is
// re-checked because one of its pieces changed: edits to a piece never block on its conjunto's material.
export function validateCatalogEntry(entry: CatalogEntry, entries: CatalogEntries, {publish=false,references=true,materials=true}: {publish?:boolean;references?:boolean;materials?:boolean}={}): string[] {
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
 if(type==='sizes' && !sizeLabels.includes(String(data.label))) fail('Talla: la etiqueta debe ser XS, S, M, L o XL.');
 // Category assignments are edited after a draft is created, as for products.
 if(type==='sizes' && references && publish) ref('category','category');
 if(type==='products') {
  if(data.bundle!==undefined && typeof data.bundle!=='boolean') fail('Bundle product: usa Sí o No.');
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
  // Native taxonomy assignments are edited after a draft is created.
  // Publication requires exactly one category, independent of bundle behavior.
  if(publish) ref('category','category');
  if(refs.size_guide?.length) ref('size_guide','size_guides');
  // Color and sizes come from the material; drafts may omit it.
  if(materials && (publish || refs.material?.length)) ref('material','materials');
  if(data.bundle===true) {
   const components=ref('components','products',true);
   if((refs.components?.length??0)<2) fail('Un conjunto necesita al menos dos productos diferentes.');
   for(const component of components) {
    if(component.id===entry.id || component.data.bundle===true) fail('Los productos incluidos deben ser productos individuales; no se permiten conjuntos anidados.');
    if(publish && materials && (!component.refs.material?.length || component.refs.material[0]!==refs.material?.[0])) fail(`Las piezas del conjunto deben usar el material del conjunto («${component.data.title??component.id}»).`);
   }
  } else {
   if(refs.components?.length) fail('Activa Bundle product para seleccionar productos incluidos.');
   ref('collection','collections');
  }
 }
 if(type==='materials') {
  if(data.special_edition!==undefined && typeof data.special_edition!=='boolean') fail('Edición especial: usa Sí o No.');
  // Drafts may be incomplete; publication needs exactly one color. Disponibilidad is optional.
  if(references && (publish || refs.color?.length)) ref('color','colors');
  if(references && refs.sizes?.length) ref('sizes','sizes',true);
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
