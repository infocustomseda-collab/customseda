import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Kysely} from 'kysely';
import {getPlatformProxy} from 'wrangler';
import {OptionsRepository} from 'emdash';
import {CatalogD1Dialect} from './d1-dialect.mjs';
import {applyModelMigrations,modelVersions} from '../../src/lib/cms/model-migration.ts';

export function remoteModelConfig(target){
 if(!['staging','production'].includes(target.environment)||!/^[a-f0-9]{32}$/i.test(target.accountId)||!/^(?!00000000-0000-0000-0000-000000000000$)(?!ffffffff-ffff-ffff-ffff-ffffffffffff$)[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(target.databaseId)) throw new Error('Invalid explicit catalog migration target.');
 return {
  name:`customseda-catalog-${target.environment}`,account_id:target.accountId,
  compatibility_date:'2026-10-22',compatibility_flags:['nodejs_compat'],
  d1_databases:[{binding:'DB',database_name:`customseda-${target.environment}`,database_id:target.databaseId,remote:true}],
 };
}

/** Runs on the deployment machine; only individual SQL calls use the D1 binding. */
export async function remoteCatalogModel(target,{check=false,proxyFactory=getPlatformProxy}={}){
 const config=remoteModelConfig(target);
 const directory=await mkdtemp(join(tmpdir(),'customseda-model-'));
 let proxy,db;
 try {
  const configPath=join(directory,'wrangler.json');
  await writeFile(configPath,JSON.stringify(config),{mode:0o600});
  proxy=await proxyFactory({configPath,envFiles:[],persist:false,remoteBindings:true});
  db=new Kysely({dialect:new CatalogD1Dialect({database:proxy.env.DB})});
  const options=new OptionsRepository(db);
  const latest=modelVersions.at(-1);
  if(check) {
   for(const version of modelVersions) {
    if(!await options.get(version)) throw new Error(`Catalog model ${version} has not been applied to ${target.environment}.`);
   }
   return {version:latest,applied:false,results:[]};
  }
  // Share a lock with other catalog migration processes, including other machines.
  const key='customseda.catalog.migration-lock';
  const owner=crypto.randomUUID();
  if(!await options.setIfAbsent(key,{owner,startedAt:new Date().toISOString()})) throw new Error('Catalog migration lock is held. Inspect the existing run before removing a stale lock.');
  const lock=await options.getVersioned(key);
  try {
   const results=await applyModelMigrations(db);
   return {version:latest,applied:results.some(r=>r.applied),results};
  }
  finally {if(lock?.value?.owner===owner) await options.compareAndDelete(key,lock.revision);}
 } finally {
  await db?.destroy();
  await proxy?.dispose();
  await rm(directory,{recursive:true,force:true});
 }
}
