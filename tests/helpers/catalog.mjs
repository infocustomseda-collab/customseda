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

export async function fixture(t,{onContentChange}={}) {
 let runtime;
 runtime=await EmDashRuntime.create({
  config:{database:{...sqlite({url:':memory:'}),entrypoint:`test-${crypto.randomUUID()}`}},
  migrationMode:'auto',plugins:[createCatalogPolicy(()=>runtime.db,{onContentChange})],
  createDialect,createStorage:null,sandboxEnabled:false,sandboxedPluginEntries:[],createSandboxRunner:null,createScheduler:null,
  siteInfo:{name:'Test',url:'http://localhost:4321'}
 });
 const db=runtime.db;t.after(()=>db.destroy());await applyCatalogModel(db);
 const repo=new ContentRepository(db);
 const lookups={};
 for(const entry of (await repo.findMany('collections')).items) lookups[entry.data.code]=entry.id;
 for(const entry of (await repo.findMany('sizes')).items) lookups[entry.slug]=entry.id;
 const taxonomy={
  findByName:async name=>(await db.selectFrom('taxonomies').selectAll().where('name','=',name).execute()),
  setTermsForEntry:async(type,id,name,ids)=>{
   const entry=await repo.findById(type,id);const group=entry.translationGroup??id;
   await db.deleteFrom('content_taxonomies').where('collection','=',type).where('entry_id','=',group).execute();
   for(const term of ids)await db.insertInto('content_taxonomies').values({collection:type,entry_id:group,taxonomy_id:term}).execute();
  },
 };
 for(const term of await taxonomy.findByName('category')) lookups[term.slug]=term.id;
 const color=await handleContentCreate(db,'colors',{slug:'rosa',data:{title:'Rosa'}});assert.equal(color.success,true,JSON.stringify(color));
 const colorId=color.data.item.id;await handleContentPublish(db,'colors',colorId);
 // Products take color and sizes from their material. These sizes leave Top XL unused.
 const material=await handleContentCreate(db,'materials',{slug:'rosa',data:{title:'Rosa'},references:{color:[colorId],sizes:['top-s','top-m','braguita-xs','braguita-xl'].map(slug=>lookups[slug])}});
 assert.equal(material.success,true,JSON.stringify(material));
 const materialId=material.data.item.id;await handleContentPublish(db,'materials',materialId);
 const image=await new MediaRepository(db).create({filename:'test.jpg',mimeType:'image/jpeg',storageKey:'test.jpg'});
 const data={title:'Test',price_cents:5000,gallery:[{image:{id:image.id},alt:'Bikini de prueba'}]};
 async function product(slug,category,mat=materialId) {
  const references={collection:[lookups.margarita],material:[mat]};
  const result=await runtime.handleContentCreate('products',{slug,data:{...data,title:slug},references});
  assert.equal(result.success,true,JSON.stringify(result));
  const id=result.data.item.id;
  await taxonomy.setTermsForEntry('products',id,'category',[lookups[category]]);
  const published=await runtime.handleContentPublish('products',id);assert.equal(published.success,true,JSON.stringify(published));
  return id;
 }
 const top=await product('top-test','top'),bottom=await product('bottom-test','braguita');
 const bundle=await runtime.handleContentCreate('products',{slug:'test-set',data:{...data,bundle:true,price_cents:8500},references:{material:[materialId],components:[top,bottom]}});
 assert.equal(bundle.success,true,JSON.stringify(bundle));
 await taxonomy.setTermsForEntry('products',bundle.data.item.id,'category',[lookups.conjuntos]);
 return {db,runtime,repo,taxonomy,lookups,colorId,materialId,image,data,top,bottom,bundle:bundle.data.item.id,product};
}
