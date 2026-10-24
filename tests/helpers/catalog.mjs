import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
// EmDash 1.3.1's test runtime still imports the Astro config virtual module.
// Supply only that host configuration; runtime, hooks and SQLite stay real.
registerHooks({resolve(specifier,context,next){
 if(specifier==='virtual:emdash/config') return {url:'data:text/javascript,export default {}',shortCircuit:true};
 return next(specifier,context);
},load(url,context,next){
 const loaded=next(url,context);
 if(url.includes('/emdash/dist/emdash-runtime-') && loaded.source) {
  return {...loaded,source:String(loaded.source).replaceAll('import.meta.env','({DEV:false,PROD:true})')};
 }
 return loaded;
}});
const {EmDashRuntime}=await import('emdash/internal/plugin-test-runtime');
import {sqlite} from 'emdash/db';
import {createDialect} from 'emdash/db/sqlite';
import {ContentRepository,MediaRepository,handleContentCreate,handleContentPublish} from 'emdash';
import {applyCatalogModel} from '../../src/lib/cms/model-migration.ts';
import {createCatalogPolicy} from '../../src/lib/cms/policy.ts';

export async function fixture(t) {
 let runtime;
 runtime=await EmDashRuntime.create({
  config:{database:{...sqlite({url:':memory:'}),entrypoint:`test-${crypto.randomUUID()}`}},
  migrationMode:'auto',plugins:[createCatalogPolicy(()=>runtime.db)],
  createDialect,createStorage:null,sandboxEnabled:false,sandboxedPluginEntries:[],createSandboxRunner:null,createScheduler:null,
  siteInfo:{name:'Test',url:'http://localhost:4321'}
 });
 const db=runtime.db;t.after(()=>db.destroy());await applyCatalogModel(db);
 const repo=new ContentRepository(db);
 const lookups={};
 for(const type of ['categories','collections','sizes']) for(const entry of (await repo.findMany(type)).items) lookups[entry.data.code]=entry.id;
 const color=await handleContentCreate(db,'colors',{slug:'rosa',data:{title:'Rosa',code:'rosa'}});assert.equal(color.success,true,JSON.stringify(color));
 const colorId=color.data.item.id;await handleContentPublish(db,'colors',colorId);
 const image=await new MediaRepository(db).create({filename:'test.jpg',mimeType:'image/jpeg',storageKey:'test.jpg'});
 const data={title:'Test',price_cents:5000,available:true,gallery:[{image:{id:image.id},alt:'Bikini de prueba'}]};
 async function product(slug,category,sizes=['S','M']) {
  const references={category:[lookups[category]],collection:[lookups.margarita],color:[colorId],sizes:sizes.map(s=>lookups[s])};
  const result=await runtime.handleContentCreate('products',{slug,data:{...data,title:slug},references});
  assert.equal(result.success,true,JSON.stringify(result));
  const id=result.data.item.id;
  const published=await runtime.handleContentPublish('products',id);assert.equal(published.success,true,JSON.stringify(published));
  return id;
 }
 const top=await product('top-test','top'),bottom=await product('bottom-test','braguita',['XS','XL']);
 const bundle=await runtime.handleContentCreate('conjuntos',{slug:'test-set',data:{...data,price_cents:8500},references:{top:[top],bottom:[bottom]}});
 assert.equal(bundle.success,true,JSON.stringify(bundle));
 return {db,runtime,repo,lookups,colorId,image,data,top,bottom,bundle:bundle.data.item.id,product};
}
