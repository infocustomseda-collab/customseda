import test from 'node:test';
import assert from 'node:assert/strict';
import {productDetail} from '../src/lib/shop/detail.ts';
import {buildCatalog,catalogView,catalogViews,filterItems,sortItems,parseFilters,filtersQuery,facetOptions,featuredItem,categoryHref,sizeGroups} from '../src/lib/shop/catalog.ts';

const entry=(type,id,data={},refs={})=>({id,slug:id,status:'published',data:{title:id.toUpperCase(),price_cents:1000,gallery:[],...data},refs});
const lookups={
 categories:[entry('categories','women',{code:'mujeres',title:'Mujeres'}),entry('categories','cat-top',{code:'top',title:'Top'}),entry('categories','cat-bottom',{code:'braguita',title:'Braguita'}),entry('categories','cat-sets',{code:'conjuntos',title:'Conjuntos'})].map(term=>({...term,slug:term.data.code,data:{...term.data,parent:term.id==='women'?null:'women'}})),
 collections:[entry('collections','col-m',{code:'margarita',title:'Margarita'})],
 // Colors are identified by slug; the ID differs to show the slug is what the shop reads.
 colors:[{...entry('colors','c-caoba',{title:'Caoba'}),slug:'caoba'},{...entry('colors','c-rojo',{title:'Rojo'}),slug:'rojo'}],
 // Each size belongs to one category.
 sizes:[...['S','M','L','XL'].map((label,i)=>entry('sizes',`t-${label}`,{label,sort_order:i+1},{category:['cat-top']})),
  ...['XS','S','M','L','XL'].map((label,i)=>entry('sizes',`b-${label}`,{label,sort_order:i},{category:['cat-bottom']}))],
 // Products take color and sizes from their material. Rojo has no braguita sizes left.
 materials:[entry('materials','m-caoba',{},{color:['c-caoba'],sizes:['t-S','t-M','t-L','b-XS','b-S','b-M']}),
  entry('materials','m-rojo',{special_edition:true},{color:['c-rojo'],sizes:['t-S','t-M','t-L','t-XL']})],
};
const piece=(id,cat,material,data={})=>entry('products',id,data,{category:[cat],collection:['col-m'],material:[material]});
const shop={
 ...lookups,site_settings:[],pages:[],size_guides:[],popups:[],
 products:[
  entry('products','tierra',{bundle:true,price_cents:5000},{category:['cat-sets'],material:['m-caoba'],components:['top-tierra','braguita-curve']}),
  entry('products','fuego',{bundle:true,price_cents:5500},{category:['cat-sets'],material:['m-rojo'],components:['top-fuego','braguita-flow']}),
  entry('products','huerfano',{bundle:true,price_cents:5000},{category:['cat-sets'],material:['m-caoba'],components:['missing','braguita-curve']}),

  piece('top-tierra','cat-top','m-caoba',{price_cents:3000}),
  piece('braguita-curve','cat-bottom','m-caoba',{price_cents:2600}),
  piece('top-fuego','cat-top','m-rojo',{price_cents:3200}),
  piece('braguita-flow','cat-bottom','m-rojo',{price_cents:2600}),
 ],
};

test('catalog combines pieces and complete Conjuntos with derived color, sizes and availability',()=>{
 const items=buildCatalog(shop);
 assert.deepEqual(items.map(i=>i.slug),['tierra','fuego','top-tierra','braguita-curve','top-fuego','braguita-flow']);
 const tierra=items.find(i=>i.slug==='tierra');
 // Buyers pick each piece's size, so a Conjunto matches any size either piece offers.
 assert.deepEqual([tierra.kind,tierra.color,tierra.collection,tierra.sizes,tierra.available],['bundle','caoba','margarita',['XS','S','M','L'],true]);
 // A Conjunto is Agotado when any component has no sizes: braguita-flow has none in m-rojo.
 assert.equal(items.find(i=>i.slug==='fuego').available,false);
 assert.deepEqual(items.find(i=>i.slug==='fuego').sizes,['S','M','L','XL']);
 assert.deepEqual(items.find(i=>i.slug==='top-tierra').sizes,['S','M','L']);
 assert.equal(items.find(i=>i.slug==='braguita-curve').category,'braguita');
});

test('sizes come from the material, limited to the product category',()=>{
 // m-caoba offers Top S, M, L and Braguita XS, S, M.
 const items=buildCatalog(shop);const by=slug=>items.find(i=>i.slug===slug);
 assert.deepEqual(by('top-tierra').sizes,['S','M','L']);
 assert.deepEqual(by('braguita-curve').sizes,['XS','S','M']);
 assert.equal(by('top-tierra').color,'caoba');
 assert.equal(by('tierra').color,'caoba');
});

test('a material without sizes for the category leaves the piece Agotado',()=>{
 // braguita-flow uses m-rojo, whose sizes are all Top sizes
 const items=buildCatalog(shop);const by=slug=>items.find(i=>i.slug===slug);
 assert.deepEqual(by('braguita-flow').sizes,[]);
 assert.equal(by('braguita-flow').available,false);assert.equal(by('braguita-flow').card.available,false);
 assert.equal(by('top-fuego').available,true);
 assert.equal(productDetail(shop,'braguita-flow').item.available,false);
});

test('cards flag the special edition of the product\'s own material',()=>{
 const items=buildCatalog(shop);const by=slug=>items.find(i=>i.slug===slug).card.specialEdition;
 // m-rojo is a special edition; a Conjunto follows its own material, like its color.
 assert.deepEqual(['top-fuego','braguita-flow','fuego','top-tierra','tierra'].map(by),[true,true,true,false,false]);
});

test('views cover the combined catalog and categories; collections and unknown handles are absent',()=>{
 const items=buildCatalog(shop);
 const slugs=handle=>catalogView(handle,shop).items(items).map(i=>i.slug);
 assert.equal(slugs('bikinis').length,6);
 assert.deepEqual(slugs('conjuntos'),['tierra','fuego']);
 assert.deepEqual(slugs('top'),['top-tierra','top-fuego']);
 assert.deepEqual(slugs('braguita'),['braguita-curve','braguita-flow']);
 assert.equal(catalogView('margarita',shop),null);
 assert.equal(catalogView('gran-canaria',shop),null);
 assert.deepEqual(catalogViews(shop).map(v=>v.handle),['bikinis','mujeres','top','braguita','conjuntos','braguitas']);
 assert.equal(catalogView('top',shop).title,'Top');
});

test('filters combine color and availability, without size filtering',()=>{
 const items=buildCatalog(shop);
 const slugs=f=>filterItems(items,f).map(i=>i.slug);
 assert.deepEqual(slugs({colors:['rojo'],available:false}),['fuego','top-fuego','braguita-flow']);
 assert.deepEqual(slugs({colors:['caoba','rojo'],available:true}),['tierra','top-tierra','braguita-curve','top-fuego']);
 assert.deepEqual(slugs({colors:['rojo'],available:true}),['top-fuego']);
 // Old label-only size bookmarks have no category and are ignored.
 assert.equal(slugs({colors:[],sizes:['XS'],available:false}).length,6);
});

test('each item keeps its sizes per category; a Conjunto keeps each piece\'s',()=>{
 const items=buildCatalog(shop);const by=slug=>items.find(i=>i.slug===slug);
 assert.deepEqual(by('tierra').sizesByCategory,{top:['S','M','L'],braguita:['XS','S','M']});
 assert.deepEqual(by('fuego').sizesByCategory,{top:['S','M','L','XL'],braguita:[]});
 assert.deepEqual(by('top-tierra').sizesByCategory,{top:['S','M','L']});
 assert.deepEqual(by('braguita-flow').sizesByCategory,{braguita:[]});
});

test('size filters: AND within a category; one category keeps its pieces and matching Conjuntos; two keep only Conjuntos',()=>{
 const items=buildCatalog(shop);
 const slugs=(sizes,more={})=>filterItems(items,{colors:[],available:false,sizes,...more}).map(i=>i.slug);
 assert.deepEqual(slugs(['top-m']),['tierra','fuego','top-tierra','top-fuego']);
 assert.deepEqual(slugs(['braguita-s']),['tierra','braguita-curve']);
 // Both sizes must be offered by the same piece.
 assert.deepEqual(slugs(['top-m','top-xl']),['fuego','top-fuego']);
 assert.deepEqual(slugs(['top-m','braguita-s']),['tierra']);
 assert.deepEqual(slugs(['top-xl','braguita-s']),[]);
 // Combined with color and availability: Fuego is Agotado (Braguita Flow has no sizes).
 assert.deepEqual(slugs(['top-m'],{colors:['rojo']}),['fuego','top-fuego']);
 assert.deepEqual(slugs(['top-m'],{colors:['rojo'],available:true}),['top-fuego']);
});

test('size groups follow category order and list only sizes the items offer',()=>{
 const items=buildCatalog(shop);
 const values=groups=>groups.map(group=>[group.category,group.label,group.sizes.map(size=>`${size.value}:${size.label}`)]);
 assert.deepEqual(values(sizeGroups(items,shop)),[
  ['top','Top',['top-s:S','top-m:M','top-l:L','top-xl:XL']],
  ['braguita','Braguita',['braguita-xs:XS','braguita-s:S','braguita-m:M']],
 ]);
 // A single-category view offers only that category's group.
 assert.deepEqual(values(sizeGroups(items.filter(i=>i.category==='top'),shop)),[['top','Top',['top-s:S','top-m:M','top-l:L','top-xl:XL']]]);
 // A category without sizes in the view has no group.
 assert.deepEqual(sizeGroups(items.filter(i=>i.slug==='braguita-flow'),shop),[]);
});

test('sorting by price or name is stable and the default keeps catalog order',()=>{
 const items=buildCatalog(shop);
 assert.deepEqual(sortItems(items,'precio-asc').map(i=>i.price).slice(0,3),[2600,2600,3000]);
 assert.deepEqual(sortItems(items,'precio-desc').map(i=>i.slug).slice(0,2),['fuego','tierra']);
 assert.deepEqual(sortItems(items,'nombre').map(i=>i.title).slice(0,2),['BRAGUITA-CURVE','BRAGUITA-FLOW']);
 assert.deepEqual(sortItems(items,'destacados').map(i=>i.slug),items.map(i=>i.slug));
});

test('filters round-trip through the query string and ignore unknown values',()=>{
 const filters=parseFilters('?color=rojo&color=nada&talla=m&talla=top-m&talla=top-m&talla=braguita-xl&disponible=1&orden=precio-asc&x=1',{colors:['caoba','rojo'],sizes:['top-m','braguita-s']});
 assert.deepEqual(filters,{category:'',colors:['rojo'],sizes:['top-m'],available:true,sort:'precio-asc'});
 assert.equal(filtersQuery(filters),'?color=rojo&talla=top-m&disponible=1&orden=precio-asc');
 assert.deepEqual(parseFilters('?talla=top-m',{colors:[]}).sizes,[]);
 assert.equal(filtersQuery({colors:[],available:false,sort:'destacados'}),'');
 assert.equal(parseFilters('?orden=raro',{colors:[]}).sort,'destacados');
});

test('facet options list only values present in the view, in lookup order',()=>{
 const items=buildCatalog(shop);
 const facets=facetOptions(items.filter(i=>i.category==='top'),shop);
 assert.deepEqual(facets.colors,[{slug:'caoba',label:'Caoba'},{slug:'rojo',label:'Rojo'}]);
});

test('the featured Conjunto resolves through catalog rules and disappears without a component',()=>{
 assert.equal(featuredItem(shop,'tierra').slug,'tierra');
 assert.equal(featuredItem(shop,'huerfano'),null);
 assert.equal(featuredItem(shop,'top-tierra'),null);
 assert.equal(featuredItem(shop,undefined),null);
});

test('category links keep the catalog path and current refinements',()=>{
 const filters={category:'',colors:['rojo','caoba'],available:true,sort:'precio-desc'};
 assert.equal(categoryHref('/collections/bikinis',filters,'top'),'/collections/bikinis?category=top&color=rojo&color=caoba&disponible=1&orden=precio-desc');
 assert.equal(categoryHref('/collections/bikinis',filters,'conjuntos'),'/collections/bikinis?category=conjuntos&color=rojo&color=caoba&disponible=1&orden=precio-desc');
 assert.equal(categoryHref('/collections/bikinis',{colors:[],available:false},''),'/collections/bikinis');
});

test('category queries filter the same catalog and combine with color and availability',()=>{
 const items=buildCatalog(shop);
 const slugs=query=>filterItems(items,parseFilters(query,{colors:['rojo','caoba'],categories:['top','braguita','conjuntos']})).map(item=>item.slug);
 assert.deepEqual(slugs('?category=top'),['top-tierra','top-fuego']);
 assert.deepEqual(slugs('?category=conjuntos'),['tierra','fuego']);
 assert.deepEqual(slugs('?category=braguita'),['braguita-curve','braguita-flow']);
 assert.equal(slugs('?category=todos').length,6);
 assert.deepEqual(slugs('?category=top&color=rojo&disponible=1'),['top-fuego']);
 // Rojo has no braguita sizes left, so Braguita Flow is Agotado.
 assert.deepEqual(slugs('?category=braguita&color=rojo&disponible=1'),[]);
 assert.equal(slugs('?category=unknown').length,6);
 assert.equal(parseFilters('',{colors:[],categories:['top','braguita','conjuntos'],defaultCategory:'top'}).category,'top');
 assert.equal(parseFilters('?category=todos',{colors:[],categories:['top','braguita','conjuntos'],defaultCategory:'top'}).category,'');
});

test('catalog cards identify the product type and localized color without changing titles',()=>{
 const items=buildCatalog(shop);
 assert.equal(items.find(i=>i.slug==='tierra').card.metadata,'Conjuntos · Caoba');
 assert.equal(items.find(i=>i.slug==='top-tierra').card.metadata,'Top · Caoba');
 assert.equal(items.find(i=>i.slug==='braguita-flow').card.metadata,'Braguita · Rojo');
 assert.equal(items.find(i=>i.slug==='tierra').card.title,'TIERRA');
});
