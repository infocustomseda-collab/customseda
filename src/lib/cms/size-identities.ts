import {ContentRepository,OptionsRepository,SchemaRegistry} from 'emdash';
import {sql} from 'kysely';
import seed from '../../../seed/seed.json' with {type:'json'};
import type {CatalogDb} from './catalog-store.ts';

export const sizeIdentitiesVersion='customseda.size-identities.v1';
export const sizeIdentityMergeVersion='customseda.size-identities.v2';
const retiredSlug=(slug:string,id:string)=>`retired-seed-en-${slug}-${id.toLowerCase()}`;

async function categorySignatures(db:CatalogDb,groups:string[]) {
 const assignments=await sql<{entry_id:string;name:string;slug:string}>`SELECT ct.entry_id,t.name,t.slug
   FROM content_taxonomies ct INNER JOIN taxonomies t ON COALESCE(t.translation_group,t.id)=ct.taxonomy_id
   WHERE ct.collection='sizes' AND ct.entry_id IN (${sql.join(groups)})`.execute(db);
 return (group:string)=>JSON.stringify([...new Set(assignments.rows.filter(row=>row.entry_id===group).map(row=>JSON.stringify([row.name,row.slug])))].sort());
}

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

 // Preflight every candidate before any write. Keep referenced identities intact,
 // including historical snapshots, rather than blocking unrelated deployments.
 const referenced=new Set<string>();
 if(candidates.length) {
  const ids=[...new Set(candidates.flatMap(size=>[size.id,size.translationGroup??size.id]))];
  // Seeds can also have independent localized category terms. Compare their
  // stable taxonomy name/slug, rather than treating translated term IDs as edits.
  const groups=[...new Set(candidates.flatMap(size=>[size.originalGroup,size.translationGroup??size.id]))];
  const assigned=await categorySignatures(db,groups);
  for(const size of candidates) {
   if(assigned(size.originalGroup)!==assigned(size.translationGroup??size.id)) throw new Error(`Size ${size.originalSlug}: category assignments differ; review before cleanup.`);
  }
  const references=await sql<{id:string}>`SELECT DISTINCT child_group AS id FROM _emdash_content_references
   WHERE child_group IN (${sql.join(ids)}) UNION SELECT DISTINCT parent_group AS id FROM _emdash_content_references
   WHERE parent_group IN (${sql.join(ids)})`.execute(db);
  const revisions=await sql<{id:string}>`SELECT DISTINCT j.value AS id FROM revisions r, json_tree(r.data) j
   WHERE r.entry_id NOT IN (${sql.join(candidates.map(size=>size.id))})
    AND j.type='text' AND j.value IN (${sql.join(ids)})`.execute(db);
  const menus=await sql<{id:string}>`SELECT DISTINCT reference_id AS id FROM _emdash_menu_items
   WHERE reference_collection='sizes' AND reference_id IN (${sql.join(ids)})`.execute(db);
  for(const row of [...references.rows,...revisions.rows,...menus.rows]) referenced.add(row.id);
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
 const retained=candidates.filter(size=>referenced.has(size.id)||referenced.has(size.translationGroup??size.id));
 const unused=candidates.filter(size=>!retained.includes(size));
 for(const size of unused) {
  // Trash reserves slugs in EmDash. Free the English slug for a real translation.
  const archived=retiredSlug(size.originalSlug,size.id);
  if(size.slug!==archived) await repo.update('sizes',size.id,{slug:archived});
  await repo.delete('sizes',size.id); // Recoverable native trash, never permanent deletion.
 }
 await db.updateTable('_emdash_fields').set({translatable:0}).where('id','in',fields.slice(1).map(field=>field!.id)).execute();
 await schema.updateField('sizes','title',{translatable:true});
 const identity=(size:{id:string;originalSlug:string})=>({id:size.id,originalSlug:size.originalSlug});
 await options.set(sizeIdentitiesVersion,{appliedAt:new Date().toISOString(),trashed:unused.map(identity),retained:retained.map(identity)});
 return {version:sizeIdentitiesVersion,applied:true,trashed:unused.length,retained:retained.length};
}

const selectionFields=['_references','_referencesBaseline'] as const;

async function historicalSizeReferences(db:CatalogDb,ids:string[]) {
 const blocked=await sql<{id:string}>`SELECT id FROM _emdash_content_references
  WHERE child_group IN (${sql.join(ids)}) OR parent_group IN (${sql.join(ids)})
  UNION ALL SELECT id FROM _emdash_menu_items
  WHERE reference_collection='sizes' AND reference_id IN (${sql.join(ids)}) LIMIT 1`.execute(db);
 if(blocked.rows.length) throw new Error('Retained size has a live relation or menu reference. Review it before merging sizes.');
 return (await sql<{id:string;collection:string;data:string;path:string;arrayIndex:number;scheduled:string|null}>`
  SELECT DISTINCT r.id,r.collection,r.data,j.path,typeof(j.key)='integer' AS arrayIndex,m.id AS scheduled
  FROM revisions r
  LEFT JOIN ec_materials m ON r.collection='materials' AND m.draft_revision_id=r.id
   AND m.deleted_at IS NULL AND m.scheduled_at IS NOT NULL
  CROSS JOIN json_tree(r.data) j
  WHERE j.type='text' AND j.value IN (${sql.join(ids)})`.execute(db)).rows;
}

/** Consolidate the historical material selections that kept v1's seed copies active. */
export async function applySizeIdentityMerge(db:CatalogDb) {
 const options=new OptionsRepository(db);
 const version=sizeIdentityMergeVersion;
 if(await options.get(version)) return {version,applied:false};
 const prior=await options.get(sizeIdentitiesVersion) as {retained?:{id:string;originalSlug:string}[]}|null;
 if(!prior) throw new Error('Size identity v1 must be applied before merging retained copies.');
 const retained=prior.retained??[];
 const repo=new ContentRepository(db);
 const moves=new Map<string,string>();
 const copies=[];
 for(const {id,originalSlug} of retained) {
  const copy=await repo.findByIdIncludingTrashed('sizes',id);
  const original=await repo.findByIdOrSlug('sizes',originalSlug,'es');
  const archived=retiredSlug(originalSlug,id);
  if(!copy || !original || original.locale!=='es' || original.slug!==originalSlug || copy.locale!=='en'
   || (copy.slug!==originalSlug && copy.slug!==archived) || (copy.deletedAt && copy.slug!==archived)
   || copy.draftRevisionId || copy.scheduledAt || JSON.stringify(copy.data)!==JSON.stringify(original.data)) {
   throw new Error(`Size ${originalSlug}: the retained copy or its Spanish match changed. Review before merging sizes.`);
  }
  const from=copy.translationGroup??id,to=original.translationGroup??original.id;
  if(from===to) throw new Error(`Size ${originalSlug}: retained copy is already a translation. Review before merging sizes.`);
  moves.set(id,to);
  moves.set(from,to);
  copies.push({copy,from,to,archived});
 }

 let rewritten=0;
 if(copies.length) {
  const groups=[...new Set(copies.flatMap(({from,to})=>[from,to]))];
  const assigned=await categorySignatures(db,groups);
  const siblings=(await sql<{id:string;grp:string}>`SELECT id,COALESCE(translation_group,id) AS grp
   FROM ec_sizes WHERE deleted_at IS NULL AND COALESCE(translation_group,id) IN (${sql.join([...moves.keys()])})`.execute(db)).rows;
  for(const {copy,from,to} of copies) {
   if(assigned(from)!==assigned(to) || siblings.some(row=>row.grp===from && row.id!==copy.id)) {
    throw new Error(`Size ${copy.slug}: category or translation group changed. Review before merging sizes.`);
   }
  }
  const ids=[...moves.keys()];
  const references=await historicalSizeReferences(db,ids);
  const revisions=new Map<string,{before:string;data:Record<string,{sizes?:string[]}>}>();
  for(const row of references) {
   if(row.scheduled) throw new Error(`Retained size is selected by a scheduled material draft ${row.id}. Review it before merging sizes.`);
   const field=selectionFields.find(field=>row.path===`$.${field}.sizes` || row.path===`$."${field}".sizes`);
   const revision=revisions.get(row.id)??{before:row.data,data:JSON.parse(row.data)};
   const selection=field && revision.data[field]?.sizes;
   if(row.collection!=='materials' || !row.arrayIndex || !Array.isArray(selection)
    || !selection.every(value=>typeof value==='string')) {
    throw new Error(`Unexpected reference to a retained size in revision ${row.id}. Review before merging sizes.`);
   }
   revisions.set(row.id,revision);
  }
  for(const {data} of revisions.values()) {
   for(const field of selectionFields) {
    const selected=data[field]?.sizes;
    if(selected?.some(id=>moves.has(id))) data[field].sizes=[...new Set(selected.map(id=>moves.get(id)??id))];
   }
  }
  // Keep revision IDs, timestamps and all unrelated content. Compare the source
  // before writing so a concurrent edit cannot be overwritten. Each write can be retried.
  for(const [id,{before,data}] of revisions) {
   const result=await sql`UPDATE revisions SET data=${JSON.stringify(data)} WHERE id=${id} AND data=${before}`.execute(db);
   if(result.numAffectedRows!==1n) throw new Error(`Revision ${id} changed during the size merge. Retry after reviewing it.`);
   rewritten++;
  }
  const assertNoReferences=async()=>{
   if((await historicalSizeReferences(db,ids)).length) throw new Error('Retained size references changed during the merge. Retry after reviewing them.');
  };
  await assertNoReferences();
  for(const {copy,archived} of copies) {
   if(copy.deletedAt) continue;
   if(copy.slug!==archived) await repo.update('sizes',copy.id,{slug:archived});
   if(!await repo.delete('sizes',copy.id)) throw new Error(`Could not retire size ${copy.slug}.`);
  }
  await assertNoReferences();
 }
 await options.set(version,{appliedAt:new Date().toISOString(),merged:copies.length,rewritten});
 return {version,applied:true,merged:copies.length,rewritten};
}
