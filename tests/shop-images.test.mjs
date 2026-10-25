import test from 'node:test';
import assert from 'node:assert/strict';
import {IMAGE_WIDTHS,annotateImages,collectImages,derivativeSrc,derivativeWidths,srcsetOf} from '../src/lib/shop/images.ts';
import {imageView} from '../src/lib/shop/view.ts';

const media=(key,width=2000,height=1500)=>({id:`m-${key}`,provider:'local',width,height,meta:{storageKey:key}});
const block=key=>({_type:'image',_key:key,asset:{id:`a-${key}`,url:`/_emdash/api/media/file/${key}`},alt:'Foto'});
const snapshot={shop:{
 products:[{data:{gallery:[{image:media('a.jpg')},{image:media('b.jpg')}]}}],
 site_settings:[{data:{hero_image:media('a.jpg'),slideshow:[{image:media('c.png',2048,1365)}],highlights:[{image:media('d.jpg',300,300)}]}}],
 pages:[{data:{content:[{_type:'block',children:[]},block('e.jpg')]}}],
 popups:[{data:{image:media('f.jpg')}}],
}};

test('snapshot images are collected from every image field once',()=>{
 assert.deepEqual(collectImages(snapshot).map(i=>i.key).sort(),['a.jpg','b.jpg','c.png','d.jpg','e.jpg','f.jpg']);
 assert.equal(collectImages(snapshot).find(i=>i.key==='c.png').width,2048);
 // Portable-text assets have no stored size; the build measures them.
 assert.equal(collectImages(snapshot).find(i=>i.key==='e.jpg').width,undefined);
});

test('widths never upscale, and a small original keeps its own size',()=>{
 assert.deepEqual(IMAGE_WIDTHS,[480,960,1440]);
 assert.deepEqual(derivativeWidths(2792),[480,960,1440]);
 assert.deepEqual(derivativeWidths(1000),[480,960]);
 assert.deepEqual(derivativeWidths(300),[300]);
});

test('derivative names are stable and path-safe for a storage key',()=>{
 assert.equal(derivativeSrc('01M5R1TJMJ85SSC9Q5VBKC14B5.jpg',960),'/media/01M5R1TJMJ85SSC9Q5VBKC14B5-960.webp');
 assert.equal(derivativeSrc('../x y.png',480),'/media/x-y-480.webp');
 assert.equal(srcsetOf([{width:480,src:'/media/a-480.webp'},{width:960,src:'/media/a-960.webp'}]),'/media/a-480.webp 480w, /media/a-960.webp 960w');
});

test('annotated images gain srcset; missing derivatives fall back to the original URL',()=>{
 const generated=new Map([['a.jpg',{width:2000,height:1500,derivatives:[{width:480,src:'/media/a-480.webp'}]}],['e.jpg',{width:1200,height:800,derivatives:[{width:480,src:'/media/e-480.webp'}]}]]);
 const annotated=annotateImages(snapshot,generated);
 const gallery=annotated.shop.products[0].data.gallery;
 assert.equal(imageView(gallery[0].image,'').srcset,'/media/a-480.webp 480w');
 assert.equal(imageView(gallery[0].image,'').src,'/_emdash/api/media/file/a.jpg');
 // b.jpg had no derivative (missing in R2 or undecodable): the original stays, without srcset.
 assert.equal(imageView(gallery[1].image,'').srcset,undefined);
 const story=annotated.shop.pages[0].data.content[1].asset;
 assert.deepEqual([story.width,story.height,story.derivatives.length],[1200,800,1]);
 // The input snapshot is not mutated.
 assert.equal(snapshot.shop.products[0].data.gallery[0].image.derivatives,undefined);
});
