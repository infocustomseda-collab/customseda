import {ContentRepository,OptionsRepository,SchemaRegistry} from 'emdash';
import {validateCatalogWrite,type CatalogDb} from './catalog-store.ts';

export const shopifySourceVersion='customseda.shopify-source.v1';
export const shopifySourceCollections=new Set(['products','conjuntos','colors','pages','size_guides','site_settings','collections']);
export async function applyShopifySourceSchema(db:CatalogDb) {
 const options=new OptionsRepository(db);
 if(await options.get(shopifySourceVersion)) return;
 const schema=new SchemaRegistry(db);
 for(const collection of shopifySourceCollections) {
  if(!await schema.getField(collection,'shopify_source')) await schema.createField(collection,{
   slug:'shopify_source',label:'Shopify — datos originales de importación',type:'json',required:false,
  });
 }
 // EmDash enforces schema-required references even for drafts. Permit an
 // incomplete native draft; catalog REST/publication policies still require sizes.
 const sizes=await schema.getField('products','sizes');
 if(!sizes) throw new Error('Apply the catalog model first.');
 // EmDash 1.3.1 explicitly requires a manual migration for `required`.
 // Only schema metadata changes; catalog rows/references are never written as SQL.
 await db.updateTable('_emdash_fields').set({required:0}).where('id','=',sizes.id).execute();
 await schema.updateField('products','sizes',{label:sizes.label});
 await options.set(shopifySourceVersion,{appliedAt:new Date().toISOString()});
}
export function importRequestAllowed(input:{dev:boolean;hostname:string;role:number;origin:string;requestOrigin:string|null;csrf:string|null}) {
 return input.dev && ['localhost','127.0.0.1','[::1]'].includes(input.hostname) && input.role>=50 && input.origin===input.requestOrigin && input.csrf==='1';
}
export type ShopifyDraftInput={collection:string;slug:string;data:Record<string,unknown>;references?:Record<string,string[]>;seo?:{title?:string;description?:string}};
type Create=(collection:string,body:{data:Record<string,unknown>;slug:string;status:string;locale:string;references?:Record<string,string[]>;seo?:ShopifyDraftInput['seo']})=>Promise<{success:boolean;data?:unknown;error?:{message:string}}>;
export async function importShopifyDraft(db:CatalogDb,create:Create,input:ShopifyDraftInput) {
 if(!shopifySourceCollections.has(input.collection)) throw new Error('Unsupported import collection.');
 const source=input.data.shopify_source as Record<string,unknown>|undefined;
 const key=source?.source_key;
 if(typeof key!=='string'||!key.length||!input.slug) throw new Error('Source identity and slug are required.');
 const options=new OptionsRepository(db),repo=new ContentRepository(db);
 const mapKey=`customseda.shopify-map.${input.collection}.${key}`;
 const mapped=await options.get<string>(mapKey);
 const existing=mapped?await repo.findById(input.collection,mapped):await repo.findByIdOrSlug(input.collection,input.slug);
 if(existing) {
  if((existing.data.shopify_source as Record<string,unknown>|undefined)?.source_key!==key) throw new Error(`Source identity collision: ${input.collection}/${input.slug}`);
  return {id:existing.id,created:false,validationErrors:await validateCatalogWrite(db,input.collection,existing.id,{})};
 }
 if(mapped) throw new Error('Mapped source entry is missing; inspect the local import map before retrying.');
 const validationErrors=await validateCatalogWrite(db,input.collection,undefined,input);
 // Native writers can stage incomplete references. Publication still invokes the
 // unchanged catalog policy. Findings are persisted, not treated as permission to publish.
 const result=await create(input.collection,{slug:input.slug,status:'draft',locale:'es',references:input.references,seo:input.seo,
  data:{...input.data,shopify_source:{...source,validation_errors:validationErrors}},
 });
 const created=result.data as {item?:{id?:unknown}}|undefined;
 if(!result.success||typeof created?.item?.id!=='string') throw new Error(result.error?.message??'Draft import failed.');
 await options.set(mapKey,created.item.id);
 return {id:created.item.id,created:true,validationErrors};
}
