import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Kysely} from 'kysely';
import {getPlatformProxy} from 'wrangler';
import {runMigrations} from 'emdash/db';
import {ContentRepository,OptionsRepository,RevisionRepository,SchemaRegistry} from 'emdash';
import {CatalogD1Dialect} from '../../scripts/cms/d1-dialect.mjs';
import {remoteCatalogModel} from '../../scripts/cms/remote-model.mjs';
import {modelVersion,storefrontVersion,collectionPagesVersion,colorSlugsVersion,productAvailabilityVersion,productGalleryOrderVersion,materialEditorOrderVersion} from '../../src/lib/cms/model-migration.ts';
import {cleanupVersion} from '../../src/lib/cms/retire-import.ts';
import {sizeCategoriesVersion} from '../../src/lib/cms/size-categories.ts';
import {materialSizeOrderVersion,materialsVersion} from '../../src/lib/cms/materials.ts';
import {productMaterialsVersion} from '../../src/lib/cms/product-materials.ts';
import {sizeIdentitiesVersion,sizeIdentityMergeVersion} from '../../src/lib/cms/size-identities.ts';
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
 const check=await remoteCatalogModel(target,{check:true,proxyFactory});assert.equal(check.version,sizeIdentityMergeVersion);
 assert.deepEqual(first.results.map(r=>r.version),[modelVersion,storefrontVersion,checkoutVersion,cleanupVersion,sizeCategoriesVersion,collectionPagesVersion,colorSlugsVersion,materialsVersion,productMaterialsVersion,materialSizeOrderVersion,productAvailabilityVersion,productGalleryOrderVersion,sizeIdentitiesVersion,materialEditorOrderVersion,sizeIdentityMergeVersion]);
 assert.equal((await new SchemaRegistry(db).getField('site_settings','highlights')).type,'repeater');
 assert.equal((await new SchemaRegistry(db).getCollectionWithFields('products')).fields.at(-1).slug,'gallery');
 assert.equal((await db.selectFrom('taxonomies').selectAll().where('name','=','category').execute()).length,6);
 const options=new OptionsRepository(db);
 assert.equal(await options.get('customseda.catalog.migration-lock'),null);
 // Exercise the production cleanup shape on D1, including JSON reference checks and recoverable trash.
 const repo=new ContentRepository(db);
 const spanish=(await repo.findMany('sizes',{limit:1,where:{locale:'es'}})).items[0];
 const duplicate=await repo.create({type:'sizes',locale:'en',slug:spanish.slug,data:spanish.data});
 const terms=await db.selectFrom('content_taxonomies').select('taxonomy_id').where('collection','=','sizes').where('entry_id','=',spanish.translationGroup??spanish.id).execute();
 for(const term of terms) await db.insertInto('content_taxonomies').values({collection:'sizes',entry_id:duplicate.translationGroup??duplicate.id,taxonomy_id:term.taxonomy_id}).execute();
 const material=await repo.create({type:'materials',locale:'es',slug:'historical',data:{title:'Historical'}});
 const history=new RevisionRepository(db);
 const revision=await history.create({collection:'materials',entryId:material.id,data:{title:'Earlier title',_references:{sizes:[duplicate.id,spanish.id]}}});
 await options.delete(sizeIdentitiesVersion);
 await options.delete(sizeIdentityMergeVersion);
 const upgrade=await remoteCatalogModel(target,{proxyFactory});
 assert.equal(upgrade.results.find(result=>result.version===sizeIdentityMergeVersion).rewritten,1);
 assert.deepEqual((await history.findById(revision.id)).data,{title:'Earlier title',_references:{sizes:[spanish.translationGroup??spanish.id]}});
 assert.equal((await remoteCatalogModel(target,{proxyFactory})).applied,false);
 assert.ok((await repo.findByIdIncludingTrashed('sizes',duplicate.id)).deletedAt);
 assert.equal((await repo.findMany('sizes',{limit:100})).items.length,9);
 await options.set('customseda.catalog.migration-lock',{owner:'other',startedAt:'test'});
 await assert.rejects(()=>remoteCatalogModel(target,{proxyFactory}),/lock is held/);
 assert.equal((await options.get('customseda.catalog.migration-lock')).owner,'other');
});
