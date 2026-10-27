import {ContentRepository,OptionsRepository,SchemaRegistry} from 'emdash';
import {sql} from 'kysely';
import type {CatalogDb} from './catalog-store.ts';

export const cleanupVersion='customseda.catalog-cleanup.v1';
const importedTypes=['products','conjuntos','colors','pages','size_guides','site_settings','collections'];

/** Retire one-time import data without replacing editorial rows or reference groups. */
export async function retireImport(db:CatalogDb) {
 const options=new OptionsRepository(db);
 if(await options.get(cleanupVersion)) return {version:cleanupVersion,applied:false};
 const schema=new SchemaRegistry(db),repo=new ContentRepository(db);
 const oldHome=await repo.findByIdOrSlug('site_settings','shopify-home');
 if(oldHome) {
  const home=await repo.findByIdOrSlug('site_settings','home');
  if(home&&home.id!==oldHome.id) throw new Error('Both home settings slugs exist; reconcile before retiring the import.');
  await repo.update('site_settings',oldHome.id,{slug:'home'});
 }
 // Keep the media-usage inspector's cached entry label aligned with the renamed row.
 await sql`UPDATE _emdash_media_usage_sources SET content_slug = 'home'
  WHERE collection_slug = 'site_settings' AND content_slug = 'shopify-home'
  AND content_id IN (SELECT id FROM ec_site_settings WHERE slug = 'home')`.execute(db);
 // Field deletion drops physical columns, but EmDash 1.3.1 retains revision JSON.
 // Scrub only these obsolete keys so restoring a revision cannot reintroduce them.
 await sql`UPDATE revisions SET data = json_remove(data, '$.shopify_id', '$.shopify_source')
  WHERE collection IN (${sql.join(importedTypes)})
  AND (json_type(data, '$.shopify_id') IS NOT NULL OR json_type(data, '$.shopify_source') IS NOT NULL)`.execute(db);
 for(const type of importedTypes) {
  for(const field of ['shopify_id','shopify_source']) {
   if(await schema.getField(type,field)) await schema.deleteField(type,field);
   // D1 schema changes are not transactional: a prior attempt may have removed
   // registry metadata before its DROP COLUMN completed. Recover that state too.
   const table=sql.table(`ec_${type}`);
   const columns=(await sql<{name:string}>`PRAGMA table_info(${table})`.execute(db)).rows;
   if(columns.some(column=>column.name===field)) {
    await sql`ALTER TABLE ${table} DROP COLUMN ${sql.ref(field)}`.execute(db);
   }
  }
 }
 // Native drafts may be incomplete; the catalog write/publication policy validates sizes.
 // Retain this behavior after removing the importer that originally enabled it.
 const sizes=await schema.getField('products','sizes');
 if(sizes?.required) {
  await db.updateTable('_emdash_fields').set({required:0}).where('id','=',sizes.id).execute();
  await schema.updateField('products','sizes',{label:sizes.label});
 }
 await options.deleteByPrefix('customseda.shopify-');
 await options.set(cleanupVersion,{appliedAt:new Date().toISOString()});
 return {version:cleanupVersion,applied:true};
}
