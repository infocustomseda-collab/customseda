import test from 'node:test';
import assert from 'node:assert/strict';
import { masonryLayout } from '../src/lib/shop/gallery-layout.ts';

test('places the next photo below the shorter column, after a full-width lead photo', () => {
 const layout = masonryLayout([{width:1,height:1},{width:4,height:3},{width:3,height:4},{width:16,height:9}], 820, 20);
 assert.deepEqual(layout.items[0], {left:0,top:0,width:820,height:820});
 assert.deepEqual(layout.items[1], {left:0,top:840,width:400,height:300});
 assert.equal(layout.items[2].left,420);
 assert.equal(layout.items[3].left,0);
 assert.equal(layout.items[3].top,1160);
 assert.equal(layout.height,1385);
});

test('handles empty and single-photo galleries and recalculates at a narrower width', () => {
 assert.deepEqual(masonryLayout([],820,20),{items:[],height:0});
 assert.deepEqual(masonryLayout([{width:2,height:1}],420,20),{items:[{left:0,top:0,width:420,height:210}],height:210});
 const layout=masonryLayout([{width:1,height:1},{width:4,height:3},{width:3,height:4},{width:16,height:9}],420,20);
 assert.equal(layout.items[3].left,0);
 assert.equal(layout.items[3].top,610);
});
