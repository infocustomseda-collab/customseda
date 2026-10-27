import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Kysely} from 'kysely';
import {getPlatformProxy} from 'wrangler';
import {runMigrations} from 'emdash/db';
import {ContentRepository,OptionsRepository,SchemaRegistry} from 'emdash';
import {CatalogD1Dialect} from '../../scripts/cms/d1-dialect.mjs';
import {remoteCatalogModel} from '../../scripts/cms/remote-model.mjs';
import {modelVersion,storefrontVersion} from '../../src/lib/cms/model-migration.ts';
import {cleanupVersion} from '../../src/lib/cms/retire-import.ts';
import {checkoutVersion} from '../../src/lib/commerce/payments.ts';

test('remote-model orchestration applies and retries against isolated local D1, never a remote binding',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'customseda-d1-test-'));
 const configPath=join(directory,'wrangler.json');
 await writeFile(configPath,JSON.stringify({name:'customseda-test',compatibility_date:'2026-10-22',d1_databases:[{binding:'DB',database_name:'isolated-catalog-test',database_id:'12345678-1234-1234-1234-123456789abc'}]}));
 const proxy=await getPlatformProxy({configPath,envFiles:[],persist:false,remoteBindings:false});
 const db=new Kysely({dialect:new CatalogD1Dialect({database:proxy.env.DB})});
 t.after(async()=>{await db.destroy();await proxy.dispose();await rm(directory,{recursive:true,force:true});});
 // Production always uses the official core migration CLI before this step.
 // Bootstrap an isolated fixture here to exercise real D1 binding semantics.
 await runMigrations(db);
 const target={environment:'staging',accountId:'a'.repeat(32),databaseId:'12345678-1234-1234-1234-123456789abc',origin:'https://staging.example.com'};
 const proxyFactory=async options=>{
  const supplied=JSON.parse(await readFile(options.configPath,'utf8'));
  assert.equal(supplied.d1_databases[0].database_id,target.databaseId);
  assert.equal(supplied.d1_databases[0].remote,true);
  // Substitute ONLY the connection to isolated local D1. All model SQL runs.
  return {env:{DB:proxy.env.DB},dispose:async()=>{}};
 };
 await assert.rejects(()=>remoteCatalogModel(target,{check:true,proxyFactory}),/has not been applied/);
 const first=await remoteCatalogModel(target,{proxyFactory});assert.equal(first.applied,true);
 const second=await remoteCatalogModel(target,{proxyFactory});assert.equal(second.applied,false);
 const check=await remoteCatalogModel(target,{check:true,proxyFactory});assert.equal(check.version,cleanupVersion);
 assert.deepEqual(first.results.map(r=>r.version),[modelVersion,storefrontVersion,checkoutVersion,cleanupVersion]);
 assert.equal((await new SchemaRegistry(db).getField('site_settings','highlights')).type,'repeater');
 assert.equal((await db.selectFrom('taxonomies').selectAll().where('name','=','category').execute()).length,6);
 const options=new OptionsRepository(db);
 assert.equal(await options.get('customseda.catalog.migration-lock'),null);
 await options.set('customseda.catalog.migration-lock',{owner:'other',startedAt:'test'});
 await assert.rejects(()=>remoteCatalogModel(target,{proxyFactory}),/lock is held/);
 assert.equal((await options.get('customseda.catalog.migration-lock')).owner,'other');
});
