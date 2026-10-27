import {ContentRepository,OptionsRepository,SchemaRegistry,handleContentUpdate} from 'emdash';
import {applySeed,type SeedFile} from 'emdash/seed';
import {sql} from 'kysely';
import seedJson from '../../../seed/seed.json' with {type:'json'};
import {validateCatalogWrite,type CatalogDb} from './catalog-store.ts';
import {dropField} from './drop-field.ts';

export const productMaterialsVersion='customseda.product-materials.v1';
// Local editorial correction: Braguita Curve drafts take the name of their conjunto line (by color).
// Applied by current slug; absent slugs are skipped. Approved without redirects.
export const braguitaRenames:Record<string,{slug:string;title:string}>={
 'braguita-curve':{slug:'braguita-curve-tierra',title:'BRAGUITA CURVE TIERRA'},
 'braguita-curve-2':{slug:'braguita-curve-fuego',title:'BRAGUITA CURVE FUEGO'},
 'braguita-luz':{slug:'braguita-curve-luz',title:'BRAGUITA CURVE LUZ'},
 'braguita-curve-3':{slug:'braguita-curve-marea',title:'BRAGUITA CURVE MAREA'},
 'braguita-curve-1':{slug:'braguita-curve-destello',title:'BRAGUITA CURVE DESTELLO'},
 'braguita-flow':{slug:'braguita-flow-tierra',title:'BRAGUITA FLOW TIERRA'},
};

type Row={id:string;slug:string;grp:string;bundle:number|null;data:string|null};

/** Products take their color and sizes from one material; the product Color and Tallas fields are retired. */
export async function applyProductMaterials(db:CatalogDb) {
 const options=new OptionsRepository(db);
 if(await options.get(productMaterialsVersion)) return {version:productMaterialsVersion,applied:false};
 const products=(seedJson as SeedFile).collections!.find(collection=>collection.slug==='products')!;
 await applySeed(db,{version:'1',collections:[products]},{includeContent:false,onConflict:'update'});

 const unlinked:string[]=[];
 let linked=0;
 // Fresh databases never had product colors.
 if(await new SchemaRegistry(db).getField('products','color')) {
  const edges=async(relation:string)=>{
   const rows=(await sql<{parent:string;child:string}>`SELECT e.parent_group AS parent, e.child_group AS child FROM _emdash_content_references e
    INNER JOIN _emdash_relations r ON r.id=e.relation_id WHERE r.slug=${relation} ORDER BY e.sort_order`.execute(db)).rows;
   const map=new Map<string,string[]>();
   for(const row of rows) map.set(row.parent,[...(map.get(row.parent)??[]),row.child]);
   return map;
  };
  const materialOfColor=new Map([...await edges('materials_color')].map(([material,[color]])=>[color!,material]));
  const colors=await edges('products_color'),components=await edges('products_components');
  const rows=(await sql<Row>`SELECT p.id, p.slug, COALESCE(p.translation_group, p.id) AS grp, p.bundle, r.data FROM ec_products p
   LEFT JOIN revisions r ON r.id=p.draft_revision_id WHERE p.deleted_at IS NULL ORDER BY p.slug`.execute(db)).rows;
  // The live row keeps the live color's material; a pending draft that staged another color stages
  // that color's material instead, so nothing changes publicly before the draft is published.
  const staged=(row:Row,field:string)=>{
   const value=row.data ? JSON.parse(row.data)._references?.[field] : undefined;
   return Array.isArray(value) ? value as string[] : undefined;
  };
  const live=new Map<string,string|undefined>(),pending=new Map<string,string|undefined>();
  for(const row of rows.filter(row=>!row.bundle)) {
   live.set(row.grp,materialOfColor.get(colors.get(row.grp)?.[0]??''));
   const color=staged(row,'color');
   pending.set(row.grp,color ? materialOfColor.get(color[0]??'') : live.get(row.grp));
  }
  // A conjunto takes its components' shared material, live from live links and pending from its draft.
  const shared=(groups:string[],of:Map<string,string|undefined>)=>{
   const found=[...new Set(groups.map(group=>of.get(group)))];
   return found.length===1 ? found[0] : undefined;
  };
  for(const row of rows.filter(row=>row.bundle)) {
   live.set(row.grp,shared(components.get(row.grp)??[],live));
   pending.set(row.grp,shared(staged(row,'components')??components.get(row.grp)??[],pending));
  }
  const writes=rows.flatMap(row=>{
   const current=live.get(row.grp),draft=pending.get(row.grp);
   if(!current && !draft) {unlinked.push(row.slug);return [];}
   return [{row,current,draft:draft!==current&&row.data ? draft : undefined}];
  });
  // Validate every write before changing anything.
  for(const {row,current,draft} of writes) for(const material of [current,draft]) {
   if(!material) continue;
   const errors=await validateCatalogWrite(db,'products',row.id,{references:{material:[material]}});
   if(errors.length) throw new Error(`Product ${row.slug}: ${errors.join(' ')}`);
  }
  for(const {row,current,draft} of writes) {
   if(current) {
    const result=await handleContentUpdate(db,'products',row.id,{references:{material:[current]}});
    if(!result.success) throw new Error(`Product ${row.slug}: ${result.error.message}`);
   }
   if(draft) {
    const data=JSON.parse(row.data!);
    data._references={...data._references,material:[draft]};
    data._referencesBaseline={...data._referencesBaseline,material:current?[current]:[]};
    await sql`UPDATE revisions SET data=${JSON.stringify(data)} WHERE id=(SELECT draft_revision_id FROM ec_products WHERE id=${row.id})`.execute(db);
   }
  }
  linked=writes.length;
 }

 let renamed=0;
 const repo=new ContentRepository(db);
 for(const [from,to] of Object.entries(braguitaRenames)) {
  const product=await repo.findByIdOrSlug('products',from);
  if(!product || product.slug!==from) continue;
  await repo.update('products',product.id,{slug:to.slug,data:{title:to.title}});
  if(product.draftRevisionId) {
   await sql`UPDATE revisions SET data=json_set(data, '$.title', ${to.title}) WHERE id=${product.draftRevisionId}`.execute(db);
   await sql`UPDATE revisions SET data=json_set(data, '$._slug', ${to.slug}) WHERE id=${product.draftRevisionId} AND json_type(data, '$._slug') IS NOT NULL`.execute(db);
  }
  renamed++;
 }

 await dropField(db,'products','color');
 await dropField(db,'products','sizes');
 // EmDash 1.3.1 deletes reference fields but keeps their relation definitions and links.
 const retired=sql`SELECT id FROM _emdash_relations WHERE slug IN ('products_color','products_sizes')`;
 await sql`DELETE FROM _emdash_content_references WHERE relation_id IN (${retired})`.execute(db);
 await sql`DELETE FROM _emdash_relations WHERE slug IN ('products_color','products_sizes')`.execute(db);
 await sql`UPDATE revisions SET data=json_remove(data, '$._references.color', '$._references.sizes', '$._referencesBaseline.color', '$._referencesBaseline.sizes')
  WHERE collection='products'`.execute(db);
 await options.set(productMaterialsVersion,{appliedAt:new Date().toISOString()});
 return {version:productMaterialsVersion,applied:true,linked,renamed,unlinked};
}
