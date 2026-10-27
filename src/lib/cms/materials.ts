import {ContentRepository,OptionsRepository,handleContentCreate,handleContentPublish,handleContentUpdate} from 'emdash';
import {applySeed,type SeedFile} from 'emdash/seed';
import {sql} from 'kysely';
import seedJson from '../../../seed/seed.json' with {type:'json'};
import {validateCatalogWrite,type CatalogDb} from './catalog-store.ts';

export const materialsVersion='customseda.materials.v1';
// The only initial material flagged as a special edition.
const specialEditions=new Set(['rojo-brillante']);

/** Sorts size groups by category slug (Braguita before Top), then size order. Unknown groups go last. */
async function sizeSorter(db:CatalogDb) {
 const rows=(await sql<{grp:string}>`SELECT COALESCE(s.translation_group, s.id) AS grp FROM ec_sizes s WHERE s.deleted_at IS NULL
  ORDER BY (SELECT MIN(t.slug) FROM content_taxonomies ct INNER JOIN taxonomies t ON t.translation_group=ct.taxonomy_id
   WHERE ct.collection='sizes' AND ct.entry_id=COALESCE(s.translation_group, s.id) AND t.name='category'), s.sort_order, s.slug`.execute(db)).rows;
 const rank=new Map(rows.map((row,index)=>[row.grp,index]));
 return (groups:string[])=>groups.toSorted((a,b)=>(rank.get(a)??rank.size)-(rank.get(b)??rank.size));
}

/** Adds Materiales and one published material per existing published color, available in every size. */
export async function applyMaterials(db:CatalogDb) {
 const options=new OptionsRepository(db);
 if(await options.get(materialsVersion)) return {version:materialsVersion,applied:false};
 const materials=(seedJson as SeedFile).collections!.find(collection=>collection.slug==='materials')!;
 await applySeed(db,{version:'1',collections:[materials]},{includeContent:false,onConflict:'update'});

 const repo=new ContentRepository(db);
 const published=async(type:string)=>(await repo.findMany(type,{where:{status:'published'},limit:100})).items;
 const sizes=(await sizeSorter(db))((await published('sizes')).map(size=>size.translationGroup??size.id));
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

export const materialSizeOrderVersion='customseda.material-size-order.v1';
type MaterialRow={id:string;slug:string;grp:string;revision:string|null;data:string|null};

/** Existing materials list Disponibilidad by category, then size, once. Later editor orders are kept. */
export async function applyMaterialSizeOrder(db:CatalogDb) {
 const options=new OptionsRepository(db);
 if(await options.get(materialSizeOrderVersion)) return {version:materialSizeOrderVersion,applied:false};
 const sorted=await sizeSorter(db);
 const links=new Map<string,string[]>();
 for(const row of (await sql<{parent:string;child:string}>`SELECT e.parent_group AS parent, e.child_group AS child FROM _emdash_content_references e
  INNER JOIN _emdash_relations r ON r.id=e.relation_id WHERE r.slug='materials_sizes' ORDER BY e.sort_order`.execute(db)).rows)
  links.set(row.parent,[...(links.get(row.parent)??[]),row.child]);
 const rows=(await sql<MaterialRow>`SELECT m.id, m.slug, COALESCE(m.translation_group, m.id) AS grp, r.id AS revision, r.data FROM ec_materials m
  LEFT JOIN revisions r ON r.id=m.draft_revision_id WHERE m.deleted_at IS NULL ORDER BY m.slug`.execute(db)).rows;
 const same=(a:string[],b:string[])=>a.join()===b.join();
 let reordered=0;
 for(const row of rows) {
  const live=links.get(row.grp)??[],next=sorted(live);
  if(!same(live,next)) {
   const result=await handleContentUpdate(db,'materials',row.id,{references:{sizes:next}});
   if(!result.success) throw new Error(`Material ${row.slug}: ${result.error.message}`);
  }
  // A pending draft keeps its own selection, in the same order.
  let staged=false;
  if(row.data) {
   const data=JSON.parse(row.data);
   for(const key of ['_references','_referencesBaseline']) {
    const sizes=data[key]?.sizes;
    if(!Array.isArray(sizes) || same(sizes,sorted(sizes))) continue;
    data[key]={...data[key],sizes:sorted(sizes)};staged=true;
   }
   if(staged) await sql`UPDATE revisions SET data=${JSON.stringify(data)} WHERE id=${row.revision}`.execute(db);
  }
  if(staged || !same(live,next)) reordered++;
 }
 await options.set(materialSizeOrderVersion,{appliedAt:new Date().toISOString()});
 return {version:materialSizeOrderVersion,applied:true,reordered};
}
