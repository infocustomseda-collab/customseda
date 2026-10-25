import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Kysely} from 'kysely';
import {getPlatformProxy} from 'wrangler';
import {CatalogD1Dialect} from '../cms/d1-dialect.mjs';
import {validateTarget} from '../deploy/target.mjs';

/** Remote D1 and R2 of exactly one validated environment, never the top-level local bindings. */
export function remoteBindingsConfig(config,environment){
 const target=validateTarget(config,environment);
 const bucket=config.env[environment].r2_buckets.find(x=>x.binding==='MEDIA').bucket_name;
 return {
  name:`customseda-build-${environment}`,account_id:target.accountId,
  compatibility_date:'2026-10-22',compatibility_flags:['nodejs_compat'],
  d1_databases:[{binding:'DB',database_name:`customseda-${environment}`,database_id:target.databaseId,remote:true}],
  r2_buckets:[{binding:'MEDIA',bucket_name:bucket,remote:true}],
 };
}

/** Database and media for a build: local persisted state, or one remote environment. */
export async function openBindings(environment,{proxyFactory=getPlatformProxy}={}){
 let proxy,directory;
 if(environment==='local') {
  proxy=await proxyFactory({configPath:'wrangler.jsonc',envFiles:[],persist:true,remoteBindings:false});
 } else {
  const config=remoteBindingsConfig(JSON.parse(await readFile('wrangler.jsonc','utf8')),environment);
  directory=await mkdtemp(join(tmpdir(),'customseda-build-'));
  const configPath=join(directory,'wrangler.json');
  await writeFile(configPath,JSON.stringify(config),{mode:0o600});
  proxy=await proxyFactory({configPath,envFiles:[],persist:false,remoteBindings:true});
 }
 const db=new Kysely({dialect:new CatalogD1Dialect({database:proxy.env.DB})});
 return {db,media:proxy.env.MEDIA,async dispose(){
  await db.destroy();await proxy.dispose();
  if(directory) await rm(directory,{recursive:true,force:true});
 }};
}
