import {SqliteAdapter,sql} from 'kysely';
import {D1Dialect} from 'kysely-d1';

// CLI host adapter only. Runtime continues to use @emdash-cms/cloudflare.
// The stock dialect needs D1's five-term SELECT ceiling and non-transactional
// DDL behavior declared. It must not replace EmDash's core migration executor.
class CatalogD1Adapter extends SqliteAdapter {
 get compoundSelectLimit(){return 5;}
 get supportsTransactionalDdl(){return false;}
}
export class CatalogD1Dialect extends D1Dialect {
 createAdapter(){return new CatalogD1Adapter();}
 createIntrospector(db){
  // D1 disallows Kysely's correlated pragma_table_info cross-join.
  return {
   async getSchemas(){return [];},
   async getTables(options={}){
    const {rows}=await sql`SELECT name,type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'`.execute(db);
    const tables=[];
    for(const row of rows){
     if(!options.withInternalKyselyTables && ['kysely_migration','kysely_migration_lock'].includes(row.name)) continue;
     const columns=await sql`SELECT * FROM pragma_table_info(${sql.lit(row.name)})`.execute(db);
     tables.push({name:row.name,isView:row.type==='view',isForeign:false,columns:columns.rows.map(c=>({name:c.name,dataType:c.type,isNullable:!c.notnull,isAutoIncrementing:c.pk>0&&c.type.toLowerCase()==='integer',hasDefaultValue:c.dflt_value!==null}))});
    }
    return tables;
   },
   async getMetadata(options){return {tables:await this.getTables(options)};},
  };
 }
}
