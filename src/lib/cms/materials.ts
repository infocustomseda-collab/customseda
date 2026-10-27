import {ContentRepository,OptionsRepository,handleContentCreate,handleContentPublish} from 'emdash';
import {applySeed,type SeedFile} from 'emdash/seed';
import seedJson from '../../../seed/seed.json' with {type:'json'};
import {validateCatalogWrite,type CatalogDb} from './catalog-store.ts';

export const materialsVersion='customseda.materials.v1';
// The only initial material flagged as a special edition.
const specialEditions=new Set(['rojo-brillante']);

/** Adds Materiales and one published material per existing published color, available in every size. */
export async function applyMaterials(db:CatalogDb) {
 const options=new OptionsRepository(db);
 if(await options.get(materialsVersion)) return {version:materialsVersion,applied:false};
 const materials=(seedJson as SeedFile).collections!.find(collection=>collection.slug==='materials')!;
 await applySeed(db,{version:'1',collections:[materials]},{includeContent:false,onConflict:'update'});

 const repo=new ContentRepository(db);
 const published=async(type:string)=>(await repo.findMany(type,{where:{status:'published'},limit:100})).items;
 const sizes=(await published('sizes')).toSorted((a,b)=>Number(a.data.sort_order??0)-Number(b.data.sort_order??0)).map(size=>size.translationGroup??size.id);
 let created=0;
 for(const color of await published('colors')) {
  // Matched by slug, so an interrupted run resumes without duplicates.
  if(!color.slug || await repo.findByIdOrSlug('materials',color.slug)) continue;
  const body={slug:color.slug,data:{title:String(color.data.title??color.slug),special_edition:specialEditions.has(color.slug)},
   references:{color:[color.translationGroup??color.id],sizes}};
  // Written like an importer: catalog rules first, then EmDash's own handlers.
  const errors=await validateCatalogWrite(db,'materials',undefined,body,{publish:true});
  if(errors.length) throw new Error(`Material ${color.slug}: ${errors.join(' ')}`);
  const result=await handleContentCreate(db,'materials',body);
  if(!result.success) throw new Error(`Material ${color.slug}: ${result.error.message}`);
  const publication=await handleContentPublish(db,'materials',result.data.item.id);
  if(!publication.success) throw new Error(`Material ${color.slug}: ${publication.error.message}`);
  created++;
 }
 await options.set(materialsVersion,{appliedAt:new Date().toISOString()});
 return {version:materialsVersion,applied:true,created};
}
