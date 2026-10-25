import {Kysely} from 'kysely';
import {getPlatformProxy} from 'wrangler';
import {runMigrations} from 'emdash/db';
import {CatalogD1Dialect} from '../cms/d1-dialect.mjs';

/**
 * Prerendering runs EmDash inside a local Worker whose D1 is a LOCAL stand-in for the target
 * environment's database (never the remote one). EmDash refuses unmigrated databases
 * (migrations.runtime: "check"), so migrate that local copy before `astro build`. Pages read the snapshot.
 */
export async function migratePrerenderDatabase(environment,{proxyFactory=getPlatformProxy}={}) {
 const proxy=await proxyFactory({configPath:'wrangler.jsonc',environment:environment==='local'?undefined:environment,envFiles:[],persist:true,remoteBindings:false});
 const db=new Kysely({dialect:new CatalogD1Dialect({database:proxy.env.DB})});
 try {await runMigrations(db);}
 finally {await db.destroy();await proxy.dispose();}
}

if(import.meta.url===`file://${process.argv[1]}`) {
 const environment=process.argv[2]??'local';
 migratePrerenderDatabase(environment).then(()=>console.log(`Prerender database (${environment}, local) migrated.`),error=>{console.error(error.message);process.exitCode=1;});
}
