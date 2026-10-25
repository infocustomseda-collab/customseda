import test from 'node:test';
import assert from 'node:assert/strict';
import {contentLayout} from '../src/lib/shop/content-layout.ts';

const block=(text,style='normal')=>({_type:'block',_key:text,style,markDefs:[],children:[{_type:'span',_key:`${text}s`,text,marks:[]}]});
const image=key=>({_type:'image',_key:key,asset:{url:`/_emdash/api/media/file/${key}.jpg`}});

test('a leading photo leads the page and trailing photos follow the text',()=>{
 const layout=contentLayout([image('pau'),block('HOLA! SOY PAULA SEDA','h2'),block('Texto'),image('grupo')],{heading:'Sobre Seda',headingFromContent:true});
 assert.equal(layout.heading,'HOLA! SOY PAULA SEDA');
 assert.equal(layout.lead?._key,'pau');
 assert.deepEqual(layout.body.map(b=>b._key),['Texto']);
 assert.deepEqual(layout.trailing.map(b=>b._key),['grupo']);
 assert.deepEqual(layout.toc,[]);
});

test('a page that is only a photo keeps it in the text column (the size guide)',()=>{
 const layout=contentLayout([image('tallas')],{heading:'Guía de tallas',headingFromContent:true});
 assert.equal(layout.lead,undefined);
 assert.equal(layout.heading,'Guía de tallas');
 assert.deepEqual(layout.body.map(b=>b._key),['tallas']);
 assert.deepEqual(layout.trailing,[]);
});

test('without a content heading the page title stays and photos inside the text stay in place',()=>{
 const layout=contentLayout([block('Intro'),image('mid'),block('Fin')],{heading:'Envíos'});
 assert.equal(layout.heading,'Envíos');
 assert.equal(layout.lead,undefined);
 assert.deepEqual(layout.body.map(b=>b._key),['Intro','mid','Fin']);
 assert.deepEqual(layout.trailing,[]);
});

test('pages with enough headings get anchored sections nested under their h2',()=>{
 const blocks=[block('Intro'),block('🚚 Envíos','h2'),block('Tiempos de Entrega','h3'),block('Costes de Envío','h3'),block('🔄 Devoluciones y Reembolsos','h2'),block('Reembolsos','h3'),block('Reembolsos','h3')];
 const layout=contentLayout(blocks,{heading:'Envíos y Devoluciones'});
 assert.deepEqual(layout.toc,[
  {id:'envios',text:'🚚 Envíos',children:[{id:'tiempos-de-entrega',text:'Tiempos de Entrega'},{id:'costes-de-envio',text:'Costes de Envío'}]},
  {id:'devoluciones-y-reembolsos',text:'🔄 Devoluciones y Reembolsos',children:[{id:'reembolsos',text:'Reembolsos'},{id:'reembolsos-2',text:'Reembolsos'}]},
 ]);
 assert.deepEqual(layout.body.filter(b=>b.style!=='normal').map(b=>b._anchor),['envios','tiempos-de-entrega','costes-de-envio','devoluciones-y-reembolsos','reembolsos','reembolsos-2']);
 assert.equal(blocks[1]._anchor,undefined,'input blocks are not mutated');
});

test('short pages get no index; headings before the first h2 are listed at the top level',()=>{
 assert.deepEqual(contentLayout([block('Uno','h2'),block('Dos','h2'),block('Tres','h3')],{heading:'X'}).toc,[]);
 const toc=contentLayout(['A','B','C','D'].map(t=>block(t,'h3')),{heading:'X'}).toc;
 assert.deepEqual(toc.map(x=>x.id),['a','b','c','d']);
});
