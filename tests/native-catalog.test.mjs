import test from 'node:test';
import assert from 'node:assert/strict';
import seed from '../seed/seed.json' with {type:'json'};
import {validateCatalogEntry} from '../src/lib/cms/catalog.ts';
import {buildCatalog,filterItems,parseFilters,filtersQuery} from '../src/lib/shop/catalog.ts';
import {parseOrder,quoteOrder,orderMetadata} from '../src/lib/commerce/checkout.ts';
const entry=(id,data={},refs={})=>({id,slug:id,type:'products',status:'published',data:{title:id,price_cents:3000,available:true,gallery:[{image:{id:'photo'},alt:id}],...data},refs});
const category=(id,slug,parent=null)=>({...entry(id,{title:slug,code:slug,parent}),type:'category',slug});
const categories=[category('women','mujeres'),category('top','top','women'),category('bottom','braguita','women'),category('sets','conjuntos','women'),category('men','hombres'),category('swim','banador','men')];
const products=[entry('a',{}, {category:['top'],color:['red'],collection:['col'],sizes:['s']}),entry('b',{}, {category:['bottom'],color:['blue'],collection:['col'],sizes:['s']}),entry('c',{}, {category:['swim'],color:['red'],collection:['col'],sizes:['s']}),entry('set',{bundle:true,price_cents:8000},{category:['sets'],components:['a','b','c'],collection:['col'],color:[]})];
const shop={categories,products,collections:[entry('col',{code:'margarita'})],colors:[entry('red'),entry('blue')],sizes:[entry('s',{code:'any-s',label:'S'})],shipping_rules:[entry('pickup',{enabled:true,zone:'pickup',price_cents:0})]};
test('schema uses native hierarchical category and a single products collection with components',()=>{
 assert.ok(!seed.collections.some(c=>['categories','conjuntos'].includes(c.slug)));
 const product=seed.collections.find(c=>c.slug==='products');
 assert.ok(!product.fields.some(f=>f.slug==='category'));
 assert.equal(product.fields.find(f=>f.slug==='bundle').type,'boolean');
 assert.equal(product.fields.find(f=>f.slug==='components').validation.targetCollection,'products');
 const taxonomy=seed.taxonomies.find(t=>t.name==='category');
 assert.equal(taxonomy.hierarchical,true);assert.deepEqual(taxonomy.collections,['products','sizes']);
 assert.equal(taxonomy.terms.find(t=>t.slug==='banador').parent,'hombres');
});
test('bundles accept more than two ordinary products with different colors',()=>{
 const graph=new Map([...categories,...shop.collections.map(e=>({...e,type:'collections'})),...shop.colors.map(e=>({...e,type:'colors'})),...shop.sizes.map(e=>({...e,type:'sizes'})),...products].map(e=>[e.id,e]));
 assert.deepEqual(validateCatalogEntry(products[3],graph,{publish:true}),[]);
 assert.ok(validateCatalogEntry({...products[3],refs:{...products[3].refs,components:['a']}},graph,{publish:true}).length);
 graph.set('a',{...products[0],data:{...products[0].data,bundle:true}});
 assert.ok(validateCatalogEntry(products[3],graph,{publish:true}).length);
});
test('categories filter real terms and ancestors regardless of bundle flag',()=>{
 const items=buildCatalog(shop);
 assert.deepEqual(filterItems(items,{category:'mujeres',colors:[],available:false}).map(i=>i.id).sort(),['a','b','set']);
 assert.deepEqual(filterItems(items,{category:'conjuntos',colors:[],available:false}).map(i=>i.id),['set']);
 assert.deepEqual(filterItems(items,{category:'hombres',colors:[],available:false}).map(i=>i.id),['c']);
 assert.equal(filtersQuery({category:'',colors:[],available:false}),'');
 assert.equal(parseFilters('?category=todos',{colors:[],categories:['top','conjuntos']}).category,'');
 assert.equal(parseFilters('?category=top',{colors:[],categories:['top','conjuntos']}).category,'top');
});
test('checkout requires and records a size per included product for a three component bundle',()=>{
 const form=new FormData();
 for(const [k,v] of Object.entries({id:'set',quantity:'1',price:'8000',shipping:'pickup','size_a':'S','size_b':'S','size_c':'S'}))form.set(k,v);
 const order=parseOrder(form);const quote=quoteOrder(shop,order);
 assert.equal(quote.ok,true,JSON.stringify(quote));
 assert.deepEqual(quote.line.components.map(c=>[c.id,c.size]),[['a','S'],['b','S'],['c','S']]);
 const metadata=orderMetadata(quote);assert.equal(metadata.component_3_id,'c');assert.equal(metadata.component_3_size,'S');
 form.delete('size_c');assert.equal(quoteOrder(shop,parseOrder(form)).error,'size');
});

test('payment confirmation reads indexed and chunked component sizes and older paid orders',async()=>{
 const {orderSizeSummary}=await import('../src/lib/commerce/checkout.ts');
 const form=new FormData();for(const [key,value]of Object.entries({id:'set',quantity:'1',price:'8000',shipping:'pickup',size_a:'S',size_b:'S',size_c:'S'}))form.set(key,value);
 const quote=quoteOrder(shop,parseOrder(form));
 assert.equal(orderSizeSummary(orderMetadata(quote)),'a: S · b: S · c: S');
 const encoded=JSON.stringify([{id:'a',title:'Top',size:'M'},{id:'b',title:'Bottom',size:'S'}]);
 assert.equal(orderSizeSummary({item_kind:'bundle',components_1:encoded.slice(0,30),components_2:encoded.slice(30)}),'Top: M · Bottom: S');
 assert.equal(orderSizeSummary({item_kind:'conjunto',top_size:'M',braguita_size:'S'}),'Top: M · Braguita: S');
 assert.equal(orderSizeSummary({piece_size:'XL'}),'Talla: XL');
});

test('category navigation follows native parent and sibling order',async()=>{
 const {categoryOptions}=await import('../src/lib/shop/catalog.ts');
 const shuffled=[categories[0],categories[1],categories[5],categories[2],categories[4],categories[3]];
 assert.deepEqual(categoryOptions(shuffled).map(term=>term.slug),['mujeres','top','braguita','conjuntos','hombres','banador']);
});

test('the bikini page is scoped to Mujeres and offers only its descendant categories',async()=>{
 const {catalogView,catalogCategories}=await import('../src/lib/shop/catalog.ts');
 const view=catalogView('bikinis',shop);
 const scoped=view.items(buildCatalog(shop));
 assert.deepEqual(scoped.map(item=>item.id).sort(),['a','b','set']);
 const options=catalogCategories(view,shop.categories);
 assert.deepEqual(options.map(term=>term.slug),['top','braguita','conjuntos']);
 const allowed={colors:[],categories:options.map(term=>term.slug)};
 const all=parseFilters('',allowed);
 assert.equal(filtersQuery(all),'');
 assert.deepEqual(filterItems(scoped,all).map(item=>item.id).sort(),['a','b','set']);
 assert.deepEqual(filterItems(scoped,parseFilters('?category=top',allowed)).map(item=>item.id),['a']);
 const outside=parseFilters('?category=hombres',allowed);
 assert.equal(outside.category,'');
 assert.deepEqual(filterItems(scoped,outside).map(item=>item.id).sort(),['a','b','set']);
 // Men's category archive keeps its own scope rather than using the bikini page.
 const men=catalogView('hombres',shop);
 assert.deepEqual(men.items(buildCatalog(shop)).map(item=>item.id),['c']);
 assert.deepEqual(catalogCategories(men,shop.categories).map(term=>term.slug),['banador']);
});
