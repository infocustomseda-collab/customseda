import test from 'node:test';
import assert from 'node:assert/strict';
import {margaritaOrder,homepage} from '../scripts/cms/storefront-content.mjs';

const text=(key,value)=>({_type:'block',_key:key,style:'normal',markDefs:[],children:[{_type:'span',_key:`${key}s`,text:value,marks:[]}]});
const image=n=>({_type:'image',_key:`image${n}`,asset:{id:`m${n}`},alt:'MARGARITA'});
const imported=[text('p0','PRIMERA COLECCIÓN'),text('p1','Intro'),text('p2','Uno'),text('p3','Dos'),text('p4','Cierre'),text('p5','Ver colección'),
 ...Array.from({length:12},(_,i)=>image(i))];

test('Margarita blocks return to the source order with a heading and a linked call to action',()=>{
 const ordered=margaritaOrder(imported);
 const shape=ordered.map(b=>b._type==='image'?'I':b.children.map(c=>c.text).join(''));
 assert.deepEqual(shape,['PRIMERA COLECCIÓN','Intro','I','I','I','Uno','I','I','I','Dos','I','I','I','Cierre','I','I','I','Ver colección']);
 assert.equal(ordered[0].style,'h2');
 assert.deepEqual(ordered.at(-1).markDefs,[{_type:'link',_key:'cta',href:'/collections/bikinis'}]);
 assert.deepEqual(ordered.at(-1).children[0].marks,['cta']);
 assert.deepEqual(ordered.filter(b=>b._type==='image').map(b=>b._key),imported.slice(6).map(b=>b._key));
});

test('already ordered or editor-changed content is left alone',()=>{
 assert.equal(margaritaOrder(margaritaOrder(imported)),null);
 assert.equal(margaritaOrder(imported.slice(1)),null);
});

test('homepage source copy keeps the bold phrase and three process cards',()=>{
 assert.deepEqual(homepage.introText[0].children.filter(c=>c.marks.includes('strong')).map(c=>c.text),['seguras, cómodas y atractivas']);
 assert.deepEqual(homepage.highlights.map(h=>h.title),['El patrón','La costura','El tejido']);
 assert.equal(homepage.slideshow.length,5);
});
