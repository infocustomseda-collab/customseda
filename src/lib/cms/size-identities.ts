import {ContentRepository,OptionsRepository,SchemaRegistry} from 'emdash';
import {sql} from 'kysely';
import seed from '../../../seed/seed.json' with {type:'json'};
import type {CatalogDb} from './catalog-store.ts';

export const sizeIdentitiesVersion='customseda.size-identities.v1';
const retiredSlug=(slug:string,id:string)=>`retired-seed-en-${slug}-${id.toLowerCase()}`;

/** Keep Spanish size identities; retire only unused, unedited English seed duplicates. */
export async function applySizeIdentities(db:CatalogDb) {
 const options=new OptionsRepository(db);
 if(await options.get(sizeIdentitiesVersion)) return {version:sizeIdentitiesVersion,applied:false};
 const repo=new ContentRepository(db),schema=new SchemaRegistry(db);
 const result=await repo.findMany('sizes',{limit:100});
 if(result.nextCursor) throw new Error('Size cleanup requires a paginated review for more than 100 sizes.');
 const sizes=result.items;
 const seeded=new Set(seed.content.sizes.map(size=>size.slug));
 const candidates=[];
 for(const size of sizes) {
  if(size.locale!=='en') continue;
  // Recognize an interrupted run between renaming and trashing a duplicate.
  const slug=[...seeded].find(slug=>size.slug===slug || size.slug===retiredSlug(slug,size.id));
  if(!slug) continue;
  const original=sizes.find(other=>other.locale==='es' && other.slug===slug);
  if(!original || (original.translationGroup??original.id)===(size.translationGroup??size.id)) continue;
  const group=size.translationGroup??size.id;
  if(size.draftRevisionId || size.scheduledAt || JSON.stringify(size.data)!==JSON.stringify(original.data)
   || sizes.some(other=>other.id!==size.id && (other.translationGroup??other.id)===group)) {
   throw new Error(`Size ${size.slug}: English copy has edits or translations; review it before cleanup.`);
  }
  candidates.push({...size,originalSlug:slug,originalGroup:original.translationGroup??original.id});
 }

 // Preflight every candidate before any write. Even historical reference snapshots
 // must remain restorable; a referenced duplicate requires an explicit merge instead.
 if(candidates.length) {
  const ids=[...new Set(candidates.flatMap(size=>[size.id,size.translationGroup??size.id]))];
  // Seeds can also have independent localized category terms. Compare their
  // stable taxonomy name/slug, rather than treating translated term IDs as edits.
  const groups=[...new Set(candidates.flatMap(size=>[size.originalGroup,size.translationGroup??size.id]))];
  const assignments=await sql<{entry_id:string;name:string;slug:string}>`SELECT ct.entry_id,t.name,t.slug
   FROM content_taxonomies ct INNER JOIN taxonomies t ON COALESCE(t.translation_group,t.id)=ct.taxonomy_id
   WHERE ct.collection='sizes' AND ct.entry_id IN (${sql.join(groups)})`.execute(db);
  const assigned=(group:string)=>JSON.stringify([...new Set(assignments.rows.filter(row=>row.entry_id===group).map(row=>JSON.stringify([row.name,row.slug])))].sort());
  for(const size of candidates) {
   if(assigned(size.originalGroup)!==assigned(size.translationGroup??size.id)) throw new Error(`Size ${size.originalSlug}: category assignments differ; review before cleanup.`);
  }
  const references=await sql`SELECT 1 FROM _emdash_content_references
   WHERE child_group IN (${sql.join(ids)}) OR parent_group IN (${sql.join(ids)}) LIMIT 1`.execute(db);
  const revisions=await sql`SELECT 1 FROM revisions r, json_tree(r.data) j
   WHERE r.entry_id NOT IN (${sql.join(candidates.map(size=>size.id))})
    AND j.type='text' AND j.value IN (${sql.join(ids)}) LIMIT 1`.execute(db);
  const menus=await sql`SELECT 1 FROM _emdash_menu_items
   WHERE reference_collection='sizes' AND reference_id IN (${sql.join(ids)}) LIMIT 1`.execute(db);
  if(references.rows.length || revisions.rows.length || menus.rows.length) {
   throw new Error('English size copies are referenced; review and merge their selections before cleanup.');
  }
 }
 // Changing a field to shared requires a manual content migration in EmDash.
 // Existing genuine translations must already agree before changing their metadata.
 const groups=new Map<string,string>();
 for(const size of sizes) {
  const group=size.translationGroup??size.id;
  const shared=JSON.stringify([size.data.label,size.data.sort_order]);
  if(groups.has(group) && groups.get(group)!==shared) throw new Error(`Size ${size.slug}: translations disagree on shared size values.`);
  groups.set(group,shared);
 }
 const fields=await Promise.all(['title','label','sort_order'].map(field=>schema.getField('sizes',field)));
 if(fields.some(field=>!field)) throw new Error('Size title, label or order field is missing.');
 for(const size of candidates) {
  // Trash reserves slugs in EmDash. Free the English slug for a real translation.
  const archived=retiredSlug(size.originalSlug,size.id);
  if(size.slug!==archived) await repo.update('sizes',size.id,{slug:archived});
  await repo.delete('sizes',size.id); // Recoverable native trash, never permanent deletion.
 }
 await db.updateTable('_emdash_fields').set({translatable:0}).where('id','in',fields.slice(1).map(field=>field!.id)).execute();
 await schema.updateField('sizes','title',{translatable:true});
 await options.set(sizeIdentitiesVersion,{appliedAt:new Date().toISOString(),trashed:candidates.map(size=>({id:size.id,originalSlug:size.originalSlug}))});
 return {version:sizeIdentitiesVersion,applied:true,trashed:candidates.length};
}
