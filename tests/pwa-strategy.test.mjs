import test from 'node:test';
import assert from 'node:assert/strict';
import {keepsForOffline,routeStrategy} from '../src/lib/pwa/strategy.js';

const s=(path,method='GET')=>routeStrategy(new URL(path,'https://seda.example'),method);

test('checkout, payments, admin and every non-GET stay on the network',()=>{
 assert.equal(s('/api/checkout','POST'),'network-only');
 assert.equal(s('/products/fuego','POST'),'network-only');
 assert.equal(s('/api/stripe/webhook'),'network-only');
 assert.equal(s('/checkout/gracias?session_id=x'),'network-only');
 assert.equal(s('/checkout/cancelado'),'network-only');
 assert.equal(s('/_emdash/admin'),'network-only');
 assert.equal(s('/_emdash/api/media/file/a.jpg'),'network-only');
 assert.equal(s('/sw.js'),'network-only');
});

test('pages are network-first so prices and availability are fresh online',()=>{
 for(const path of ['/','/products/fuego','/collections/bikinis?talla=M','/offline','/manifest.webmanifest']) assert.equal(s(path),'network-first',path);
});

test('hashed build assets are cache-first; media and icons revalidate',()=>{
 assert.equal(s('/_astro/Shop.AmK4R8gt.css'),'cache-first');
 assert.equal(s('/_astro/fonts/cormorant.woff2'),'cache-first');
 assert.equal(s('/media/a-960.webp'),'stale-while-revalidate');
 assert.equal(s('/icons/icon-192.png'),'stale-while-revalidate');
 assert.equal(s('/brand/seda-wordmark.png'),'stale-while-revalidate');
});

test('network-first keeps every visited page for offline, including client-router fetches',()=>{
 assert.equal(keepsForOffline('navigate','text/html; charset=utf-8'),true);
 assert.equal(keepsForOffline('cors','text/html; charset=utf-8'),true);
 assert.equal(keepsForOffline('same-origin','text/html'),true);
 assert.equal(keepsForOffline('cors','application/manifest+json'),false);
 assert.equal(keepsForOffline('navigate',null),true);
});
