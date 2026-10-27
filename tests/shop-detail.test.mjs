import test from 'node:test';
import assert from 'node:assert/strict';
import {productDetail} from '../src/lib/shop/detail.ts';
import {withMaterials} from './helpers/shop.mjs';

const entry=(id,data={},refs={})=>({id,slug:id,status:'published',data:{title:id.toUpperCase(),price_cents:1000,available:true,gallery:[],...data},refs});
const piece=(id,cat,color,sizes,extra={})=>entry(id,extra,{category:[cat],collection:['col'],color:[color],sizes:sizes.map(s=>`s-${s}`),...(extra.guide?{size_guide:[extra.guide]}:{})});
const shop=withMaterials({
 categories:[entry('cat-top',{code:'top',title:'Top'}),entry('cat-bottom',{code:'braguita',title:'Braguita'}),entry('cat-sets',{code:'conjuntos',title:'Conjuntos'})].map(term=>({...term,slug:term.data.code})),
 collections:[entry('col',{code:'margarita',title:'Margarita'})],
 // Colors are identified by slug; the ID differs to show the slug is what the shop reads.
 colors:[{...entry('c-caoba',{title:'Caoba'}),slug:'caoba'},{...entry('c-rojo',{title:'Rojo'}),slug:'rojo'}],
 sizes:['XS','S','M','L','XL'].map(code=>entry(`s-${code}`,{code:`any-${code}`,label:code})),
 size_guides:[entry('guia-general',{title:'Guía de tallas'}),entry('guia-top',{title:'Guía top'})],
 products:[entry('tierra',{bundle:true,price_cents:5000},{category:['cat-sets'],components:['top-tierra','braguita-curve']}),
  piece('top-tierra','cat-top','c-caoba',['S','M','L']),
  piece('braguita-curve','cat-bottom','c-caoba',['XS','S','M'],{guide:'guia-top'}),
  piece('top-fuego','cat-top','c-rojo',['S','M']),
  piece('braguita-flow','cat-bottom','c-rojo',[]),
  piece('top-luz','cat-top','c-rojo',['S']),
 ],
 pages:[],site_settings:[],popups:[],
});

test('a product resolves its labels, sizes, guide and related items',()=>{
 const detail=productDetail(shop,'top-tierra');
 assert.equal(detail.kind,'pieza');
 assert.deepEqual([detail.item.slug,detail.categoryLabel,detail.colorLabel,detail.item.sizes],['top-tierra','Top','Caoba',['S','M','L']]);
 // No guide of its own: the site's first guide applies.
 assert.equal(detail.sizeGuide.id,'guia-general');
 assert.equal(productDetail(shop,'braguita-curve').sizeGuide.id,'guia-top');
 // Same color first, then the rest of the catalog; never itself; at most four.
 assert.deepEqual(detail.related.map(i=>i.slug),['tierra','braguita-curve','top-fuego','braguita-flow']);
});

test('Conjunto slugs resolve as Conjuntos and unknown slugs are null',()=>{
 const detail=productDetail(shop,'tierra');
 assert.equal(detail.kind,'bundle');
 assert.deepEqual(detail.components.map(component=>component.item.slug),['top-tierra','braguita-curve']);
 assert.equal(detail.colorLabel,'Caoba');
 assert.equal(productDetail(shop,'nada'),null);
});

test('size-less pieces are flagged rather than given invented sizes',()=>{
 const detail=productDetail(shop,'braguita-flow');
 assert.deepEqual(detail.item.sizes,[]);
 assert.equal(detail.purchasable,false);
 assert.equal(productDetail(shop,'top-tierra').purchasable,true);
});

test('a Conjunto offers each component its own sizes and needs both to be buyable',()=>{
 const withSizeless={...shop,products:[...shop.products,entry('fuego',{bundle:true,price_cents:5500},{category:['cat-sets'],components:['top-fuego','braguita-flow']})]};
 const tierra=productDetail(withSizeless,'tierra');
 assert.deepEqual(tierra.components.map(component=>component.item.sizes),[['S','M','L'],['XS','S','M']]);
 assert.equal(tierra.purchasable,true);
 assert.equal(tierra.item.price,5000);
 const fuego=productDetail(withSizeless,'fuego');
 assert.equal(fuego.purchasable,false);
 assert.equal(fuego.sizeGuide.id,'guia-general');
});
