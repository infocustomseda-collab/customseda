import test from 'node:test';
import assert from 'node:assert/strict';
import {collectionPaths,pagePaths,policyPaths,productPaths,rootRedirectPaths} from '../src/lib/shop/paths.ts';
import {withMaterials} from './helpers/shop.mjs';

const entry=(id,data={},refs={})=>({id,slug:id,status:'published',data:{title:id,price_cents:1000,available:true,gallery:[],...data},refs});
const piece=(id,cat,sizes)=>entry(id,{},{category:[cat],collection:['col'],color:['c'],sizes:sizes.map(s=>`s-${s}`)});
const shop=withMaterials({
 categories:[entry('cat-top',{code:'top'}),entry('cat-bottom',{code:'braguita'}),entry('cat-sets',{code:'conjuntos',title:'Conjuntos'})].map(term=>({...term,slug:term.data.code})),
 collections:[entry('col',{code:'margarita',title:'Margarita'}),entry('sin-codigo',{code:''})],
 colors:[{...entry('c'),slug:'caoba'}],
 sizes:['S','M'].map(code=>entry(`s-${code}`,{code:`any-${code}`,label:code})),
 size_guides:[],
 products:[entry('tierra',{bundle:true},{category:['cat-sets'],components:['top-tierra','braguita-curve']}),entry('incompleto',{bundle:true},{category:['cat-sets'],components:['top-tierra',]}),piece('top-tierra','cat-top',['S']),piece('braguita-curve','cat-bottom',['M']),piece('top-solo','cat-top',[]),],
 pages:['margarita','contact','envios-y-devoluciones','noticias','privacy-policy'].map(slug=>entry(slug)),
 site_settings:[],popups:[],shipping_rules:[],
});
const params=paths=>paths.map(p=>Object.values(p.params)[0]).sort();

test('product paths cover pieces and Conjuntos with both components, and skip a Conjunto missing one',()=>{
 assert.deepEqual(params(productPaths(shop)),['braguita-curve','tierra','top-solo','top-tierra']);
 assert.deepEqual(productPaths(shop)[0].params,{slug:'tierra'});
});

test('collection paths include bikinis and category listings, not CMS collections',()=>{
 assert.deepEqual(params(collectionPaths(shop)),['bikinis','braguita','braguitas','conjuntos','top']);
});

test('page and policy paths come from page slugs, leaving dedicated routes alone',()=>{
 // contact and margarita have their own pages; noticias renders at /blogs/noticias but keeps its /pages path.
 assert.deepEqual(params(pagePaths(shop)),['envios-y-devoluciones','noticias','privacy-policy']);
 assert.deepEqual(params(policyPaths(shop)),['privacy-policy']);
 assert.deepEqual(rootRedirectPaths(shop).find(p=>p.params.slug==='noticias').props,{target:'/blogs/noticias'});
 assert.deepEqual(rootRedirectPaths(shop).find(p=>p.params.slug==='privacy-policy').props,{target:'/policies/privacy-policy'});
 assert.deepEqual(rootRedirectPaths(shop).find(p=>p.params.slug==='margarita').props,{target:'/pages/margarita'});
});
