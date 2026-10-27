import {ContentRepository,OptionsRepository} from 'emdash';
import {applySeed,type SeedFile} from 'emdash/seed';
import {sql} from 'kysely';
import seedJson from '../../../seed/seed.json' with {type:'json'};
import type {CatalogDb} from './catalog-store.ts';
import {sizeLabels} from './catalog.ts';
import {dropField} from './drop-field.ts';

export const sizeCategoriesVersion='customseda.size-categories.v1';
// The shared XS–XL records become this category's sizes, keeping their IDs.
const legacyOwner='braguita';

/** Shared sizes become per-category sizes with a shopper-facing label; the native slug replaces their code. */
export async function applySizeCategories(db:CatalogDb) {
 const options=new OptionsRepository(db);
 if(await options.get(sizeCategoriesVersion)) return {version:sizeCategoriesVersion,applied:false};
 // Fresh databases already receive categorized, code-free sizes from the catalog seed.
 const columns=(await sql<{name:string}>`PRAGMA table_info(ec_sizes)`.execute(db)).rows;
 const hasCode=columns.some(column=>column.name==='code');
 const legacy=hasCode ? (await sql<{id:string;group:string;code:string;draft_revision_id:string|null}>`SELECT id, COALESCE(translation_group, id) AS "group", code, draft_revision_id FROM ec_sizes
  WHERE deleted_at IS NULL AND code IN (${sql.join(sizeLabels)})`.execute(db)).rows : [];
 if(legacy.some(size=>size.draft_revision_id)) throw new Error('Publish or discard pending size drafts before migrating size categories.');
 const seed=seedJson as SeedFile;
 const sizes=seed.collections!.find(collection=>collection.slug==='sizes')!;
 const {terms:_terms,...category}=seed.taxonomies!.find(taxonomy=>taxonomy.name==='category')!;
 // Upserts the Etiqueta field and attaches the native category taxonomy to sizes.
 await applySeed(db,{version:'1',collections:[sizes],taxonomies:[category]},{includeContent:false,onConflict:'update'});

 if(legacy.length) {
  const repo=new ContentRepository(db);
  const seeded=seed.content!.sizes!;
  const term=await db.selectFrom('taxonomies').select(['id','translation_group']).where('name','=','category').where('slug','=',legacyOwner).executeTakeFirstOrThrow();
  // Update legacy rows in place. Seed matching is by slug and locale, and
  // older rows may carry a locale other than the configured one.
  const kept=new Set<string>();
  for(const size of legacy) {
   const entry=seeded.find(entry=>entry.taxonomies?.category?.includes(legacyOwner)&&entry.data.label===size.code)!;
   await repo.update('sizes',size.id,{slug:entry.slug,data:entry.data});
   await db.insertInto('content_taxonomies').values({collection:'sizes',entry_id:size.group,taxonomy_id:term.translation_group??term.id}).onConflict(oc=>oc.doNothing()).execute();
   kept.add(entry.slug!);
  }
  const created=seeded.filter(entry=>!kept.has(entry.slug!));
  await applySeed(db,{version:'1',content:{sizes:created},taxonomies:seed.taxonomies},{includeContent:true,onConflict:'skip'});
  // One locale per collection: legacy rows follow the seeded rows' configured locale.
  const locale=(await sql<{locale:string}>`SELECT locale FROM ec_sizes WHERE slug=${created[0]?.slug ?? ''}`.execute(db)).rows[0]?.locale;
  if(locale) await sql`UPDATE ec_sizes SET locale=${locale} WHERE id IN (${sql.join(legacy.map(size=>size.id))})`.execute(db);

  const groups=new Map((await sql<{slug:string;grp:string}>`SELECT slug, COALESCE(translation_group, id) AS grp FROM ec_sizes WHERE deleted_at IS NULL`.execute(db)).rows.map(row=>[row.slug,row.grp]));
  const owners=[...new Set(seeded.flatMap(entry=>entry.taxonomies?.category??[]))].filter(slug=>slug!==legacyOwner);
  for(const owner of owners) {
   const moves=new Map(sizeLabels.flatMap(label=>{
    const from=groups.get(`${legacyOwner}-${label.toLowerCase()}`),to=groups.get(`${owner}-${label.toLowerCase()}`);
    return from&&to ? [[from,to] as const] : [];
   }));
   const products=sql`SELECT ct.entry_id FROM content_taxonomies ct INNER JOIN taxonomies t ON t.translation_group=ct.taxonomy_id
    WHERE ct.collection='products' AND t.name='category' AND t.slug=${owner}`;
   for(const [from,to] of moves) {
    await sql`UPDATE _emdash_content_references SET child_group=${to}
     WHERE child_group=${from} AND relation_id IN (SELECT id FROM _emdash_relations WHERE slug='products_sizes')
     AND parent_group IN (${products})`.execute(db);
   }
   // Pending product drafts stage their own reference selection.
   const drafts=(await sql<{id:string;data:string}>`SELECT r.id, r.data FROM ec_products p INNER JOIN revisions r ON r.id=p.draft_revision_id
    WHERE p.deleted_at IS NULL AND COALESCE(p.translation_group, p.id) IN (${products})
    AND json_type(r.data, '$._references.sizes')='array'`.execute(db)).rows;
   for(const draft of drafts) {
    const data=JSON.parse(draft.data);
    data._references.sizes=data._references.sizes.map((group:string)=>moves.get(group)??group);
    await sql`UPDATE revisions SET data=${JSON.stringify(data)} WHERE id=${draft.id}`.execute(db);
   }
  }
 }

 if(hasCode) await dropField(db,'sizes','code');
 await options.set(sizeCategoriesVersion,{appliedAt:new Date().toISOString()});
 return {version:sizeCategoriesVersion,applied:true,migrated:legacy.length};
}
