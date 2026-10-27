import test from 'node:test';
import assert from 'node:assert/strict';
import {sql} from 'kysely';
import {RevisionRepository,handleContentUpdate} from 'emdash';
import {fixture} from './helpers/catalog.mjs';
import {applyMaterials,applyMaterialSizeOrder} from '../src/lib/cms/materials.ts';
import {readCatalogEntry,removalAllowed,validateCatalogWrite} from '../src/lib/cms/catalog-store.ts';
import {validateCatalogEntry} from '../src/lib/cms/catalog.ts';

async function color(f,slug,title,publish=true) {
 const created=await f.runtime.handleContentCreate('colors',{slug,data:{title}});
 assert.equal(created.success,true,JSON.stringify(created));
 if(publish) assert.equal((await f.runtime.handleContentPublish('colors',created.data.item.id)).success,true);
 return created.data.item.id;
}

test('each published color gets one published material available in every size; Rojo Brillante is a special edition',async t=>{
 const f=await fixture(t);
 const brillante=await color(f,'rojo-brillante','Rojo Brillante');
 await color(f,'borrador','Borrador',false);
 const result=await applyMaterials(f.db);
 // The fixture already has material rosa for color rosa.
 assert.equal(result.applied,true);assert.equal(result.created,1);

 const materials=(await f.repo.findMany('materials')).items;
 assert.deepEqual(materials.map(m=>m.slug).sort(),['rojo-brillante','rosa']);
 const sizes=(await f.repo.findMany('sizes')).items.map(size=>size.id).sort();
 const created=await readCatalogEntry(f.db,'materials',materials.find(m=>m.slug==='rojo-brillante').id,false);
 assert.equal(created.status,'published');assert.equal(created.data.title,'Rojo Brillante');
 assert.deepEqual(created.refs.sizes.sort(),sizes);
 assert.deepEqual(created.refs.color,[brillante]);
 assert.equal(created.data.special_edition,true);
 // The fixture's own material is left as it was.
 assert.equal((await readCatalogEntry(f.db,'materials',f.materialId,false)).refs.sizes.length,4);
 assert.equal((await applyMaterials(f.db)).applied,false);
 // A color used only by a material is protected like one used by products.
 assert.equal(await removalAllowed(f.db,'colors',brillante),false);
});

// Live Disponibilidad slugs in their stored order.
async function sizeOrder(db,material) {
 return (await sql`SELECT s.slug FROM _emdash_content_references e INNER JOIN _emdash_relations r ON r.id=e.relation_id
  INNER JOIN ec_materials m ON COALESCE(m.translation_group, m.id)=e.parent_group
  INNER JOIN ec_sizes s ON COALESCE(s.translation_group, s.id)=e.child_group
  WHERE r.slug='materials_sizes' AND m.id=${material} ORDER BY e.sort_order`.execute(db)).rows.map(row=>row.slug);
}

test('new materials list their sizes by category, then size',async t=>{
 const f=await fixture(t);
 await color(f,'caoba','Caoba');
 await applyMaterials(f.db);
 const caoba=(await f.repo.findByIdOrSlug('materials','caoba')).id;
 assert.deepEqual(await sizeOrder(f.db,caoba),['braguita-xs','braguita-s','braguita-m','braguita-l','braguita-xl','top-s','top-m','top-l','top-xl']);
});

test('existing materials and their pending drafts are reordered once by category, then size',async t=>{
 const f=await fixture(t);
 // The fixture material lists Top before Braguita.
 assert.deepEqual(await sizeOrder(f.db,f.materialId),['top-s','top-m','braguita-xs','braguita-xl']);
 const draft=await f.runtime.handleContentCreate('materials',{slug:'lycra',data:{title:'Lycra'},references:{color:[f.colorId],sizes:[f.lookups['top-s'],f.lookups['braguita-s']]}});
 assert.equal(draft.success,true,JSON.stringify(draft));
 await f.runtime.handleContentPublish('materials',draft.data.item.id);
 const staged=['top-l','braguita-m','top-s'].map(slug=>f.lookups[slug]);
 const revision=await new RevisionRepository(f.db).create({collection:'materials',entryId:draft.data.item.id,
  data:{title:'Lycra',_references:{sizes:staged},_referencesBaseline:{sizes:[f.lookups['top-s'],f.lookups['braguita-s']]}}});
 await f.repo.setDraftRevision('materials',draft.data.item.id,revision.id);

 const result=await applyMaterialSizeOrder(f.db);
 assert.equal(result.applied,true);assert.equal(result.reordered,2);
 assert.deepEqual(await sizeOrder(f.db,f.materialId),['braguita-xs','braguita-xl','top-s','top-m']);
 assert.deepEqual(await sizeOrder(f.db,draft.data.item.id),['braguita-s','top-s']);
 assert.equal((await f.repo.findById('materials',f.materialId)).status,'published');
 assert.equal((await f.repo.findById('materials',draft.data.item.id)).draftRevisionId,revision.id);
 const data=JSON.parse((await sql`SELECT data FROM revisions WHERE id=${revision.id}`.execute(f.db)).rows[0].data);
 assert.deepEqual(data._references.sizes,['braguita-m','top-s','top-l'].map(slug=>f.lookups[slug]));
 assert.deepEqual(data._referencesBaseline.sizes,['braguita-s','top-s'].map(slug=>f.lookups[slug]));

 // Later editor orders are kept.
 assert.equal((await handleContentUpdate(f.db,'materials',f.materialId,{references:{sizes:['top-m','braguita-xs'].map(slug=>f.lookups[slug])}})).success,true);
 assert.equal((await applyMaterialSizeOrder(f.db)).applied,false);
 assert.deepEqual(await sizeOrder(f.db,f.materialId),['top-m','braguita-xs']);
});

test('materials publish with exactly one color and distinct sizes; drafts may be incomplete',async t=>{
 const f=await fixture(t);
 const draft=await f.runtime.handleContentCreate('materials',{slug:'lycra',data:{title:'Lycra'}});
 assert.equal(draft.success,true,JSON.stringify(draft));
 const id=draft.data.item.id;
 assert.equal((await f.runtime.handleContentPublish('materials',id)).success,false);
 const s=f.lookups['top-s'];
 assert.ok((await validateCatalogWrite(f.db,'materials',id,{references:{color:[f.colorId],sizes:[s,s]}})).length);
 assert.ok((await validateCatalogWrite(f.db,'materials',id,{references:{color:[f.colorId],sizes:[f.colorId]}})).length);
 const updated=await f.runtime.handleContentUpdate('materials',id,{references:{color:[f.colorId],sizes:[s]}});
 assert.equal(updated.success,true,JSON.stringify(updated));
 assert.equal((await f.runtime.handleContentPublish('materials',id)).success,true);
 assert.equal(await removalAllowed(f.db,'sizes',s),false);
});

test('material color must be single and the special edition flag boolean',()=>{
 const entries=new Map([['c1',{id:'c1',type:'colors',status:'published',data:{},refs:{}}],['c2',{id:'c2',type:'colors',status:'published',data:{},refs:{}}]]);
 const material=(data,refs)=>({id:'m',type:'materials',status:'draft',data:{title:'M',...data},refs});
 assert.deepEqual(validateCatalogEntry(material({special_edition:true},{color:['c1']}),entries,{publish:true}),[]);
 assert.ok(validateCatalogEntry(material({},{color:['c1','c2']}),entries).length);
 assert.ok(validateCatalogEntry(material({special_edition:'sí'},{}),entries).length);
 assert.deepEqual(validateCatalogEntry(material({},{}),entries),[]);
});
