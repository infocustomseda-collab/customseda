import {SchemaRegistry} from 'emdash';
import {sql} from 'kysely';
import type {CatalogDb} from './catalog-store.ts';

/** Remove a retired field: revision copies, registry metadata and the physical column. */
export async function dropField(db:CatalogDb,collection:string,field:string) {
 // Field deletion drops physical columns, but EmDash 1.3.1 retains revision JSON.
 // Scrub the key so restoring a revision cannot reintroduce it.
 const path=`$.${field}`;
 await sql`UPDATE revisions SET data = json_remove(data, ${path}) WHERE collection = ${collection} AND json_type(data, ${path}) IS NOT NULL`.execute(db);
 const schema=new SchemaRegistry(db);
 if(await schema.getField(collection,field)) await schema.deleteField(collection,field);
 // D1 schema changes are not transactional; finish a DROP COLUMN a prior attempt left behind.
 const table=sql.table(`ec_${collection}`);
 if((await sql<{name:string}>`PRAGMA table_info(${table})`.execute(db)).rows.some(column=>column.name===field)) {
  await sql`ALTER TABLE ${table} DROP COLUMN ${sql.ref(field)}`.execute(db);
 }
}
