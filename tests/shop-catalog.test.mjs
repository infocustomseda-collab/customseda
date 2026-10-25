import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCatalog,catalogView,catalogViews,filterItems,sortItems,parseFilters,filtersQuery,facetOptions} from '../src/lib/shop/catalog.ts';

const entry=(type,id,data={},refs={})=>({id,slug:id,status:'published',data:{title:id.toUpperCase(),price_cents:1000,available:true,gallery:[],...data},refs});
const lookups={
 categories:[entry('categories','cat-top',{code:'top'}),entry('categories','cat-bottom',{code:'braguita'})],
 collections:[entry('collections','col-m',{code:'margarita',title:'Margarita'})],
 colors:[entry('colors','c-caoba',{code:'caoba',title:'Caoba'}),entry('colors','c-rojo',{code:'rojo',title:'Rojo'})],
 sizes:['XS','S','M','L','XL'].map((code,i)=>entry('sizes',`s-${code}`,{code,sort_order:i})),
};
const piece=(id,cat,color,sizes,data={})=>entry('products',id,data,{category:[cat],collection:['col-m'],color:[color],sizes:sizes.map(s=>`s-${s}`)});
const shop={
 ...lookups,site_settings:[],pages:[],size_guides:[],popups:[],
 products:[
  piece('top-tierra','cat-top','c-caoba',['S','M','L'],{price_cents:3000}),
  piece('braguita-curve','cat-bottom','c-caoba',['XS','S','M'],{price_cents:2600}),
  piece('top-fuego','cat-top','c-rojo',['S','M','L','XL'],{price_cents:3200,available:false}),
  piece('braguita-flow','cat-bottom','c-rojo',[],{price_cents:2600}),
 ],
 conjuntos:[
  entry('conjuntos','tierra',{price_cents:5000},{top:['top-tierra'],bottom:['braguita-curve']}),
  entry('conjuntos','fuego',{price_cents:5500},{top:['top-fuego'],bottom:['braguita-flow']}),
  entry('conjuntos','huerfano',{price_cents:5000},{top:['missing'],bottom:['braguita-curve']}),
 ],
};

test('catalog combines pieces and complete Conjuntos with derived color, sizes and availability',()=>{
 const items=buildCatalog(shop);
 assert.deepEqual(items.map(i=>i.slug),['tierra','fuego','top-tierra','top-fuego','braguita-curve','braguita-flow']);
 const tierra=items.find(i=>i.slug==='tierra');
 assert.deepEqual([tierra.kind,tierra.color,tierra.collection,tierra.sizes,tierra.available],['conjunto','caoba','margarita',['S','M'],true]);
 // A Conjunto is available only when it and both components are; sizes need both pieces.
 assert.equal(items.find(i=>i.slug==='fuego').available,false);
 assert.deepEqual(items.find(i=>i.slug==='fuego').sizes,[]);
 assert.deepEqual(items.find(i=>i.slug==='top-tierra').sizes,['S','M','L']);
 assert.equal(items.find(i=>i.slug==='braguita-curve').category,'braguita');
});

test('views cover the combined catalog, categories and collections; unknown handles are absent',()=>{
 const items=buildCatalog(shop);
 const slugs=handle=>catalogView(handle,shop).items(items).map(i=>i.slug);
 assert.equal(slugs('bikinis').length,6);
 assert.deepEqual(slugs('conjuntos'),['tierra','fuego']);
 assert.deepEqual(slugs('top'),['top-tierra','top-fuego']);
 assert.deepEqual(slugs('braguitas'),['braguita-curve','braguita-flow']);
 assert.equal(slugs('margarita').length,6);
 assert.equal(catalogView('gran-canaria',shop),null);
 assert.deepEqual(catalogViews(shop).map(v=>v.handle),['bikinis','conjuntos','top','braguitas','margarita']);
 assert.equal(catalogView('top',shop).title,'Tops');
});

test('filters combine as AND across groups and OR within a group',()=>{
 const items=buildCatalog(shop);
 const slugs=f=>filterItems(items,f).map(i=>i.slug);
 assert.deepEqual(slugs({colors:['rojo'],sizes:[],available:false}),['fuego','top-fuego','braguita-flow']);
 assert.deepEqual(slugs({colors:[],sizes:['XL'],available:false}),['top-fuego']);
 assert.deepEqual(slugs({colors:[],sizes:['XS','L'],available:false}),['top-tierra','top-fuego','braguita-curve']);
 assert.deepEqual(slugs({colors:['caoba'],sizes:['M'],available:true}),['tierra','top-tierra','braguita-curve']);
 assert.deepEqual(slugs({colors:['rojo'],sizes:['XS'],available:true}),[]);
});

test('sorting by price or name is stable and the default keeps catalog order',()=>{
 const items=buildCatalog(shop);
 assert.deepEqual(sortItems(items,'precio-asc').map(i=>i.price).slice(0,3),[2600,2600,3000]);
 assert.deepEqual(sortItems(items,'precio-desc').map(i=>i.slug).slice(0,2),['fuego','tierra']);
 assert.deepEqual(sortItems(items,'nombre').map(i=>i.title).slice(0,2),['BRAGUITA-CURVE','BRAGUITA-FLOW']);
 assert.deepEqual(sortItems(items,'destacados').map(i=>i.slug),items.map(i=>i.slug));
});

test('filters round-trip through the query string and ignore unknown values',()=>{
 const filters=parseFilters('?color=rojo&color=nada&talla=m&talla=XL&disponible=1&orden=precio-asc&x=1',{colors:['caoba','rojo']});
 assert.deepEqual(filters,{colors:['rojo'],sizes:['M','XL'],available:true,sort:'precio-asc'});
 assert.equal(filtersQuery(filters),'?color=rojo&talla=M&talla=XL&disponible=1&orden=precio-asc');
 assert.equal(filtersQuery({colors:[],sizes:[],available:false,sort:'destacados'}),'');
 assert.equal(parseFilters('?orden=raro',{colors:[]}).sort,'destacados');
});

test('facet options list only values present in the view, in lookup order',()=>{
 const items=buildCatalog(shop);
 const facets=facetOptions(items.filter(i=>i.category==='top'),shop);
 assert.deepEqual(facets.colors,[{code:'caoba',label:'Caoba'},{code:'rojo',label:'Rojo'}]);
 assert.deepEqual(facets.sizes,['S','M','L','XL']);
});
