import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('pages navigate with Astro ClientRouter, not the native cross-document rule',async()=>{
 assert.match(await read('src/layouts/Shop.astro'),/<PageTransitions \/>/);
 const transitions=await read('src/components/PageTransitions.astro');
 assert.match(transitions,/import \{ ClientRouter \} from "astro:transitions";/);
 assert.match(transitions,/<ClientRouter \/>/);
 assert.doesNotMatch(await read('src/styles/global/global.css'),/@view-transition \{/);
});

test('the buy form reloads for real: Stripe Checkout is a cross-origin redirect',async()=>{
 const box=await read('src/components/BuyBox.astro');
 assert.match(box,/<form[^>]*\bdata-astro-reload\b/);
 // Scripts run once per full load; the form's behavior must re-attach after each swap.
 assert.match(box,/customElements\.define\("buy-box"/);
 assert.doesNotMatch(box,/for \(const form of document\.querySelectorAll/);
});

test('scripts survive page swaps',async()=>{
 assert.match(await read('src/components/UpdateBanner.astro'),/data-update-banner[^>]*transition:persist|transition:persist[^>]*data-update-banner/);
 const popup=await read('src/components/SitePopup.astro');
 assert.match(popup,/isConnected/);
 assert.match(popup,/disconnectedCallback/);
 assert.match(await read('src/components/Gallery.astro'),/disconnectedCallback\(\) \{\s*this\.observer\?\.disconnect\(\)/);
});
