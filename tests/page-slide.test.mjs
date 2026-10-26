import test from 'node:test';
import assert from 'node:assert/strict';
import {menuIndex, normalizePath, slideFor} from '../src/lib/shop/slide.ts';

const menu=['/','/collections/bikinis','/pages/margarita','/blogs/noticias','/pages/contact'];

test('menu pages slide in the menu order',()=>{
 assert.equal(slideFor(menu,'/','/pages/margarita'),'forward');
 assert.equal(slideFor(menu,'/pages/contact','/collections/bikinis'),'back');
 // Browser Back between menu pages still follows the menu.
 assert.equal(slideFor(menu,'/','/pages/contact',{historyBack:true}),'forward');
});

test('pages inside a menu section take its place; others enter from the right, or the left on Back',()=>{
 assert.equal(menuIndex(menu,'/blogs/noticias/hola'),3);
 assert.equal(menuIndex(menu,'/collections'),-1);
 assert.equal(slideFor(menu,'/blogs/noticias/hola','/collections/bikinis'),'back');
 assert.equal(slideFor(menu,'/pages/contact','/policies/privacy-policy'),'forward');
 assert.equal(slideFor(menu,'/policies/privacy-policy','/pages/contact',{historyBack:true}),'back');
 assert.equal(slideFor([],'/a','/b'),'forward');
});

test('without the menu every page enters from the right',()=>{
 assert.equal(slideFor(menu,'/pages/contact','/',{menuVisible:false,historyBack:true}),'forward');
});

test('product pages crossfade for the card morph; the same page does not move',()=>{
 assert.equal(slideFor(menu,'/collections/bikinis','/products/tierra'),'morph');
 assert.equal(slideFor(menu,'/products/tierra','/'),'morph');
 assert.equal(slideFor(menu,'/','/'),'none');
 assert.equal(normalizePath('/pages/contact/'),'/pages/contact');
 assert.equal(normalizePath('/'),'/');
});
