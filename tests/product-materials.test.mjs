import test from 'node:test';
import assert from 'node:assert/strict';
import {Kysely,sql} from 'kysely';
import {createDialect} from 'emdash/db/sqlite';
import {runMigrations} from 'emdash/db';
import {ContentRepository,RevisionRepository,SchemaRegistry,applySeed,handleContentCreate,handleContentPublish} from 'emdash';
import seed from '../seed/seed.json' with {type:'json'};
import {applyMaterials} from '../src/lib/cms/materials.ts';
import {applyProductMaterials} from '../src/lib/cms/product-materials.ts';
import {applyModelMigrations} from '../src/lib/cms/model-migration.ts';
import {readCatalogEntry} from '../src/lib/cms/catalog-store.ts';

// The catalog before materials on products: each product carried its own color and sizes.
async function legacyCatalog(t) {
 const legacy=structuredClone(seed);
 const products=legacy.collections.find(c=>c.slug==='products');
 products.fields=[...products.fields.filter(f=>f.slug!=='material'),
  {slug:'color',label:'Color',type:'reference',validation:{targetCollection:'colors',multiple:false}},
  {slug:'sizes',label:'Tallas disponibles',type:'reference',validation:{targetCollection:'sizes',multiple:true}}];
 const db=new Kysely({dialect:createDialect({url:':memory:'})});t.after(()=>db.destroy());
 await runMigrations(db);await applySeed(db,legacy,{includeContent:true,onConflict:'skip'});
 const repo=new ContentRepository(db);
 const group=async(type,slug)=>{const entry=await repo.findByIdOrSlug(type,slug);return entry.translationGroup??entry.id;};
 for(const [slug,title] of [['caoba','Caoba'],['rojo','Rojo']]) {
  const color=await handleContentCreate(db,'colors',{slug,data:{title}});
  await handleContentPublish(db,'colors',color.data.item.id);
 }
 await applyMaterials(db);
 const terms=Object.fromEntries((await db.selectFrom('taxonomies').select(['slug','id']).where('name','=','category').execute()).map(t=>[t.slug,t.id]));
 const margarita=await group('collections','margarita');
 async function product(slug,category,references={},data={}) {
  const created=await handleContentCreate(db,'products',{slug,data:{title:slug.toUpperCase(),...data},references:{collection:[margarita],...references}});
  assert.equal(created.success,true,JSON.stringify(created));
  await db.insertInto('content_taxonomies').values({collection:'products',entry_id:created.data.item.id,taxonomy_id:terms[category]}).execute();
  return created.data.item.id;
 }
 return {db,repo,group,product};
}

test('products move from their color to that color\'s material; Braguita Curve drafts are renamed and old fields dropped',async t=>{
 const {db,repo,group,product}=await legacyCatalog(t);
 const caoba=await group('colors','caoba'),rojo=await group('colors','rojo');
 const sizeS=await group('sizes','braguita-s');
 const curve=await product('braguita-curve','braguita',{color:[caoba],sizes:[sizeS]});
 const top=await product('top-tierra','top',{color:[caoba]});
 const set=await product('tierra','conjuntos',{components:[curve,top]},{bundle:true});
 // The live row says Rojo; the pending draft the editor shows says Caoba.
 const fuego=await product('braguita-curve-2','braguita',{color:[rojo]});
 const revision=await new RevisionRepository(db).create({collection:'products',entryId:fuego,
  data:{title:'BRAGUITA CURVE',_slug:'braguita-curve-2',_references:{color:[caoba],sizes:[sizeS]},_referencesBaseline:{color:[rojo],sizes:[]}}});
 await repo.setDraftRevision('products',fuego,revision.id);
 await product('sin-color','braguita');

 const result=await applyProductMaterials(db);
 assert.equal(result.applied,true);assert.deepEqual(result.unlinked,['sin-color']);
 assert.equal(result.linked,4);assert.equal(result.renamed,2);

 const materialOf=async slug=>{
  const entry=await readCatalogEntry(db,'products',(await repo.findByIdOrSlug('products',slug)).id,true);
  return (await repo.findById('materials',entry.refs.material[0]))?.slug;
 };
 assert.equal(await materialOf('braguita-curve-tierra'),'caoba');
 assert.equal((await repo.findByIdOrSlug('products','braguita-curve-tierra')).data.title,'BRAGUITA CURVE TIERRA');
 assert.equal(await materialOf('top-tierra'),'caoba');
 assert.equal(await materialOf('tierra'),'caoba');
 assert.equal(await materialOf('braguita-curve-fuego'),'caoba');
 const draft=(await sql`SELECT r.data FROM ec_products p INNER JOIN revisions r ON r.id=p.draft_revision_id WHERE p.id=${fuego}`.execute(db)).rows[0];
 const staged=JSON.parse(draft.data);
 assert.equal(staged.title,'BRAGUITA CURVE FUEGO');assert.equal(staged._slug,'braguita-curve-fuego');
 assert.equal(staged._references?.color,undefined);assert.equal(staged._references?.sizes,undefined);
 assert.equal(staged._referencesBaseline?.color,undefined);assert.equal(staged._referencesBaseline?.sizes,undefined);
 assert.equal(await repo.findByIdOrSlug('products','braguita-curve'),null);
 assert.ok(set);

 for(const field of ['color','sizes']) assert.equal(await new SchemaRegistry(db).getField('products',field),null);
 const columns=(await sql`PRAGMA table_info(ec_products)`.execute(db)).rows.map(row=>row.name);
 assert.ok(!columns.includes('color')&&!columns.includes('sizes'));
 const relations=(await sql`SELECT slug FROM _emdash_relations WHERE slug IN ('products_color','products_sizes')`.execute(db)).rows;
 assert.deepEqual(relations,[]);
 assert.equal((await applyProductMaterials(db)).applied,false);
});

test('a fresh database has nothing to link, rename or drop',async t=>{
 const db=new Kysely({dialect:createDialect({url:':memory:'})});t.after(()=>db.destroy());
 await runMigrations(db);
 const results=await applyModelMigrations(db);
 const last=results.at(-1);
 assert.deepEqual({...last},{version:'customseda.product-materials.v1',applied:true,linked:0,renamed:0,unlinked:[]});
});
