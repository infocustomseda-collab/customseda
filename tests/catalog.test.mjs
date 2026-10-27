import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCatalogEntry, mainImage, bundleAvailable } from '../src/lib/cms/catalog.ts';

const lookup = (type, id, code = id) => ({type,id,status:'published',data:{title:id,code},refs:{}});
const entries = new Map([
 ['top',lookup('category','top')],['bottom',lookup('category','bottom','braguita')],
 ['margarita',lookup('collections','margarita')],['pink',lookup('colors','pink')],
 ...['XS','S','M','L','XL'].map(s=>[s,lookup('sizes',s)])
]);
const product = (id='a', category='top', sizes=['S','M']) => ({id,type:'products',status:'published',data:{title:id,price_cents:5000,available:true,gallery:[{image:{id:'media_1'},alt:'Bikini'}]},refs:{category:[category],collection:['margarita'],color:['pink'],sizes}});
const top=product(),bottom=product('b','bottom',['XS','S','XL']);
entries.set('a',top); entries.set('b',bottom);
const conjunto=()=>({id:'set',type:'products',status:'draft',data:{title:'Conjunto',bundle:true,price_cents:8500,available:true,gallery:[{image:{id:'media_2'},alt:'Conjunto'}]},refs:{category:['top'],components:['a','b']}});
const check=(entry,publish=false)=>validateCatalogEntry(entry,entries,{publish});
test('valid products and separately priced mixed-size bundle publish',()=>{
 assert.deepEqual(check(top,true),[]); assert.deepEqual(check(bottom,true),[]);
 assert.deepEqual(check(conjunto(),true),[]);
});
test('prices must be nonnegative safe integer cents',()=>{
 for(const value of [-1,1.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1,'50']) {
  assert.ok(check({...top,data:{...top.data,price_cents:value}}).some(e=>e.includes('precio')));
 }
});
test('publication requires one native category and rejects duplicate sizes and Top XS',()=>{
 for(const refs of [{...top.refs,category:[]},{...top.refs,category:['top','bottom']},{...top.refs,sizes:['XS']},{...top.refs,sizes:['S','S']}]) {
  assert.ok(check({...top,refs},true).length);
 }
});
test('bundles require distinct ordinary components and do not compare colors or collections',()=>{
 const set=conjunto();set.refs.components=['a','a'];assert.ok(check(set).length);
 const changed=new Map(entries);changed.set('b',{...bottom,refs:{...bottom.refs,color:['other'],collection:['other']}});
 assert.deepEqual(validateCatalogEntry(conjunto(),changed),[]);
 changed.set('b',{...bottom,data:{...bottom.data,bundle:true}});
 assert.ok(validateCatalogEntry(conjunto(),changed).length);
});
test('publishing a bundle requires published components',()=>{
 const changed=new Map(entries);changed.set('a',{...top,status:'draft'});
 assert.ok(validateCatalogEntry(conjunto(),changed,{publish:true}).length);
});
test('drafts can omit galleries; publishing requires valid image alt and focal point',()=>{
 const entry={...top,data:{...top.data,gallery:[]}};
 assert.deepEqual(check(entry),[]);assert.ok(check(entry,true).length);
 for(const gallery of [[{image:{id:'media_1'},alt:''}],[{image:{id:'media_1'},alt:'Image',focal_x:1.1}]]){
  assert.ok(check({...entry,data:{...entry.data,gallery}},true).length);
 }
});
test('main image follows editor gallery order and bundle availability follows all three records',()=>{
 const images=[{image:{id:'second'},alt:'Second'},{image:{id:'first'},alt:'First'}];
 assert.equal(mainImage(images).id,'second');assert.equal(mainImage([]),null);
 assert.equal(bundleAvailable({...conjunto(),status:"published"},top,bottom),true);
 assert.equal(bundleAvailable(conjunto(),top,{...bottom,data:{...bottom.data,available:false}}),false);
});

test('optional size guide rejects wrong target types and multiple selections',()=>{
 assert.ok(check({...top,refs:{...top.refs,size_guide:['pink']}}).length);
 assert.ok(check({...top,refs:{...top.refs,size_guide:['pink','top']}}).length);
 assert.deepEqual(check({...top,refs:{...top.refs,size_guide:[]}}),[]);
});
