import { ContentRepository, RevisionRepository, type Database } from 'emdash';
import { sql, type Kysely } from 'kysely';
import { catalogTypes, validateCatalogEntry, type CatalogEntry } from './catalog.ts';

export type CatalogDb = Kysely<Database>;
const targets: Record<string, Record<string,string>> = {
 products:{collection:'collections',material:'materials',size_guide:'size_guides',components:'products'},
 materials:{color:'colors',sizes:'sizes'},
};
// Collections whose entries carry one native category term.
const categorized=new Set(['products','sizes']);
export type CatalogWrite = {data?:Record<string,unknown>;references?:Record<string,string[]>;slug?:string|null};
// EmDash stores booleans as 0/1, and the admin sends an untouched switch back as stored.
const booleanFields=['bundle','special_edition'];
function withBooleans(data:Record<string,unknown>):Record<string,unknown> {
 const result={...data};
 for(const field of booleanFields) if(result[field]===0 || result[field]===1) result[field]=Boolean(result[field]);
 return result;
}
export async function readCatalogEntry(db:CatalogDb,type:string,id:string,draft=true):Promise<CatalogEntry|null> {
 if(type==='category') {
  const term=await db.selectFrom('taxonomies').selectAll().where('name','=','category').where(eb=>eb.or([eb('id','=',id),eb('translation_group','=',id)])).executeTakeFirst();
  return term ? {id:term.translation_group??term.id,type,status:'published',data:{title:term.label,code:term.slug},refs:{}} : null;
 }
 if(!catalogTypes.has(type)) return null;
 const item=await new ContentRepository(db).findByIdOrSlug(type,id);
 if(!item) return null;
 let data={...item.data};
 let staged:Record<string,unknown>={};
 if(draft && item.draftRevisionId) {
  const revision=await new RevisionRepository(db).findById(item.draftRevisionId);
  if(!revision) throw new Error('Falta la revisión pendiente.');
  data={...data,...Object.fromEntries(Object.entries(revision.data).filter(([key])=>!key.startsWith('_')))};
  staged=(revision.data._references??{}) as Record<string,unknown>;
 }
 data=withBooleans(data);
 const refs:Record<string,string[]>={};
 const selections=Object.entries(targets[type]??{}).map(([field,target])=>{
  refs[field]=[];
  const groups=staged[field];
  const membership=Array.isArray(groups)
   ? groups.length ? sql`child.translation_group IN (${sql.join(groups.map(group=>sql`${group}`))})` : sql`0=1`
   : sql`EXISTS (SELECT 1 FROM _emdash_content_references e
       INNER JOIN _emdash_relations rel ON rel.id=e.relation_id
       WHERE rel.slug=${`${type}_${field}`} AND e.parent_group=${item.translationGroup??item.id}
       AND e.child_group=child.translation_group)`;
  // The model defines only parent-side references. A UNION has at most five
  // terms (Products have four fields), matching D1's compound SELECT limit.
  return sql<{field:string;id:string}>`SELECT ${field} AS field, child.id
   FROM ${sql.table(`ec_${target}`)} child WHERE child.deleted_at IS NULL
    AND ${draft?sql`1=1`:sql`child.status='published'`} AND ${membership}`;
 });
 if(selections.length) {
  const result=await sql<{field:string;id:string}>`${sql.join(selections,sql` UNION ALL `)}`.execute(db);
  for(const row of result.rows) refs[row.field]!.push(row.id);
 }

 if(categorized.has(type)) refs.category=[...new Set((await db.selectFrom('content_taxonomies as ct').innerJoin('taxonomies as t','t.translation_group','ct.taxonomy_id').select('ct.taxonomy_id').where('ct.collection','=',type).where('ct.entry_id','=',item.translationGroup??item.id).where('t.name','=','category').execute()).map(term=>term.taxonomy_id))];
 return {id:item.id,type,status:item.status,data,refs,group:item.translationGroup??item.id};
}

type CatalogReader = (type:string,id:string,draft?:boolean)=>Promise<CatalogEntry|null>;

async function loadGraph(db:CatalogDb,root:CatalogEntry,draftRelated=false,read:CatalogReader=(type,id,draft)=>readCatalogEntry(db,type,id,draft)):Promise<Map<string,CatalogEntry>> {
 const entries=new Map<string,CatalogEntry>([[root.id,root]]);
 const pending=[root];
 while(pending.length) {
  const entry=pending.shift()!;
  for(const [field,type] of Object.entries(categorized.has(entry.type)?{...targets[entry.type],category:'category'}:targets[entry.type]??{})) {
   for(const id of entry.refs[field]??[]) {
    if(entries.has(id)) continue;
    const related=await read(type,id,draftRelated);
    if(related) {entries.set(related.id,related);pending.push(related);}
   }
  }
 }
 return entries;
}

/** Check incoming live edges AND the current staged selection; old revisions do not count. */
export async function catalogDependents(db:CatalogDb,entry:CatalogEntry):Promise<{type:string;id:string}[]> {
 const sources=await db.selectFrom('_emdash_relations').select('parent_collection').distinct().where('child_collection','=',entry.type).execute();
 const found:{type:string;id:string}[]=[];
 for(const {parent_collection:type} of sources) {
  if(!targets[type]) continue;
  // Table names come from the fixed targets map, never a request parameter.
  const rows=await sql<{id:string}>`
   SELECT c.id FROM ${sql.table(`ec_${type}`)} AS c
   LEFT JOIN revisions AS r ON r.id=c.draft_revision_id
   WHERE c.deleted_at IS NULL AND (
    EXISTS (SELECT 1 FROM _emdash_content_references AS e
     INNER JOIN _emdash_relations AS rel ON rel.id=e.relation_id
     WHERE e.parent_group=c.translation_group AND e.child_group=${entry.group??entry.id}
      AND rel.parent_collection=${type} AND rel.child_collection=${entry.type})
    OR EXISTS (SELECT 1 FROM json_tree(r.data, '$._references') AS j WHERE j.type='text' AND j.value=${entry.group??entry.id})
   ) LIMIT 101`.execute(db);
  if(rows.rows.length>100) throw new Error('Esta entrada tiene más de 100 dependencias; requiere una migración de catálogo por lotes.');
  found.push(...rows.rows.map(row=>({type,id:row.id})));
 }
 return found;
}

export async function validateCatalogWrite(db:CatalogDb,type:string,id:string|undefined,body:CatalogWrite,{publish=false,checkReferences=true}:{publish?:boolean;checkReferences?:boolean}={}):Promise<string[]> {
 if(!catalogTypes.has(type)) return [];
 const cache=new Map<string,Promise<CatalogEntry|null>>();
 const read:CatalogReader=(type,id,draft=true)=>{
  const key=`${type}:${id}:${draft}`;
  if(!cache.has(key)) cache.set(key,readCatalogEntry(db,type,id,draft));
  return cache.get(key)!;
 };
 const existing=id ? await read(type,id,true) : null;
 if(id&&!existing) return ['No se ha encontrado el contenido.'];
 const candidate:CatalogEntry={id:existing?.id??'new',type,status:existing?.status??'draft',group:existing?.group,data:{...existing?.data,...withBooleans(body.data??{})},refs:{...existing?.refs,...body.references}};
 const graph=checkReferences ? await loadGraph(db,candidate,false,read) : new Map([[candidate.id,candidate]]);
 const errors=validateCatalogEntry(candidate,graph,{publish,references:checkReferences});
 const filtered=errors;
 if(existing) {
  const dependents=await catalogDependents(db,existing);
  if(type==='collections' && dependents.length) {
   const live=await read(type,existing.id,false);
   if(live && live.data.code!==candidate.data.code) filtered.push('El código es estable y no se puede cambiar mientras esté en uso.');
  }
  // Products validate their sizes against their own category; keep used sizes in theirs.
  if(type==='sizes' && dependents.length && String(existing.refs.category??[])!==String(candidate.refs.category??[])) filtered.push('La categoría de una talla en uso no se puede cambiar; crea una talla nueva para la otra categoría.');
  if(type==='products' && checkReferences) for(const dep of dependents) {
   // Validate both live and staged bundle selections against the proposed component.
   for(const draft of [false,true]) {
    const bundle=await read(dep.type,dep.id,draft);
    if(!bundle) continue;
    // An unpublished entry has no live selection to protect. Filtering its
    // draft components to published rows would invent missing-reference errors.
    if(!draft && bundle.status!=='published') continue;
    const related=await loadGraph(db,bundle,false,read);
    related.set(candidate.id,candidate);
    // Candidate may point at a different category/collection/color; load those too.
    for(const [key,value] of graph) related.set(key,value);
    const failures=validateCatalogEntry(bundle,related,{publish:!draft&&bundle.status==='published',materials:false});
    if(failures.length) filtered.push(`El cambio rompería el conjunto «${bundle.data.title??bundle.id}»: ${failures[0]}`);
   }
  }
 }
 if(publish && Array.isArray(candidate.data.gallery)) {
  const ids=[...new Set(candidate.data.gallery.map(row=>row?.image?.id).filter((id):id is string=>typeof id==='string'))];
  if(ids.length) {
   const images=await db.selectFrom('media').select(['id','status','mime_type']).where('id','in',ids).execute();
   const ready=new Set(images.filter(image=>image.status==='ready'&&image.mime_type.startsWith('image/')).map(image=>image.id));
   if(ids.some(id=>!ready.has(id))) filtered.push('La imagen no está lista o ya no existe en la biblioteca.');
  }
 }

 return [...new Set(filtered)];
}

export async function removalAllowed(db:CatalogDb,type:string,id:string):Promise<boolean> {
 if(!catalogTypes.has(type)) return true;
 const entry=await readCatalogEntry(db,type,id);
 return !entry || (await catalogDependents(db,entry)).length===0;
}
