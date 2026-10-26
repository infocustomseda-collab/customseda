import test from 'node:test';
import assert from 'node:assert/strict';
import { CatalogGridMotion } from '../src/lib/shop/catalog-motion.ts';

function fixture() {
 const animations=[];
 const grid={children:[],appendChild(card){this.children=this.children.filter(c=>c!==card);this.children.push(card);}};
 const cards=new Map(['set','top','bottom'].map(id=>[id,{
  id,hidden:false,
  getBoundingClientRect(){return {left:0,top:grid.children.filter(c=>!c.hidden).indexOf(this)*100};},
  animate(frames,options){
   let resolve;
   const animation={finished:new Promise(r=>resolve=r),cancel(){resolve();},finish(){resolve();},frames,options,id};
   animations.push(animation);return animation;
  },
 }]));
 grid.children=[...cards.values()];
 return {grid,cards,animations,motion:new CatalogGridMotion(grid,cards,{exit:200,move:600,enter:300,easing:'ease-out'})};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('outgoing cards fade before survivors reflow to their new positions',async()=>{
 const f=fixture();
 f.motion.update(['top'],true);
 assert.equal(f.cards.get('set').hidden,false);
 assert.deepEqual(f.animations.map(a=>a.id),['set','bottom']);
 f.animations.forEach(a=>a.finish());await tick();
 assert.equal(f.cards.get('set').hidden,true);
 assert.equal(f.cards.get('top').hidden,false);
 const move=f.animations.find(a=>a.id==='top');
 assert.equal(move.frames[0].transform,'translate(0px, 100px)');
 assert.equal(move.frames[1].transform,'translate(0px, 0px)');
});

test('a newer selection cancels pending exits without applying stale layout',async()=>{
 const f=fixture();
 f.motion.update(['top'],true);
 f.motion.update(['bottom'],false);
 await tick();
 assert.deepEqual([...f.cards.values()].filter(c=>!c.hidden).map(c=>c.id),['bottom']);
});

test('reduced motion applies the new order immediately without animations',()=>{
 const f=fixture();
 f.motion.update(['bottom','set'],false);
 assert.deepEqual(f.grid.children.filter(c=>!c.hidden).map(c=>c.id),['bottom','set']);
 assert.equal(f.animations.length,0);
});

test('returning cards enter while retained cards move to their new positions',()=>{
 const f=fixture();
 f.motion.update(['top'],false);
 f.motion.update(['set','top','bottom'],true);
 assert.deepEqual(f.grid.children.filter(c=>!c.hidden).map(c=>c.id),['set','top','bottom']);
 assert.equal(f.animations.find(a=>a.id==='set').frames[0].opacity,0);
 assert.equal(f.animations.find(a=>a.id==='top').frames[0].transform,'translate(0px, -100px)');
});

test('disconnect cleanup cancels pending exits without touching detached cards',async()=>{
 const f=fixture();
 f.motion.update(['top'],true);f.motion.cancel();await tick();
 assert.equal(f.cards.get('set').hidden,false);
});
