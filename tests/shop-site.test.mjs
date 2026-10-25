import test from 'node:test';
import assert from 'node:assert/strict';
import {siteChrome,productCard,localHref,settingsOf} from '../src/lib/shop/site.ts';
import {imageView} from '../src/lib/shop/view.ts';

const menu=items=>({items:items.map(([label,url])=>({label,url,children:[]}))});
const settings={id:'s',slug:'home',status:'draft',refs:{},data:{
 announcement_enabled:true,announcement_text:'¡ENVÍO GRATIS!',announcement_url:null,
 instagram_url:'https://www.instagram.com/customseda/',tiktok_url:'https://www.tiktok.com/@customseda',
}};

test('site chrome comes from settings and menus and marks the current section',()=>{
 const site=siteChrome({settings,primary:menu([['Inicio','/'],['Colección','/pages/margarita']]),footer:menu([['Contacto','/pages/contact']]),path:'/pages/margarita'});
 assert.equal(site.siteName,'Seda');
 assert.deepEqual(site.nav,[{label:'Inicio',href:'/',current:false},{label:'Colección',href:'/pages/margarita',current:true}]);
 assert.deepEqual(site.footerLinks,[{label:'Contacto',href:'/pages/contact',current:false}]);
 assert.deepEqual(site.social.map(s=>s.network),['instagram','tiktok']);
 assert.deepEqual(site.announcement,{text:'¡ENVÍO GRATIS!',href:undefined});
 const home=siteChrome({settings,primary:menu([['Inicio','/']]),footer:null,path:'/'});
 assert.equal(home.nav[0].current,true);
});

test('disabled or empty announcements and missing settings render no chrome extras',()=>{
 const off=siteChrome({settings:{...settings,data:{...settings.data,announcement_enabled:false}},primary:null,footer:null,path:'/'});
 assert.equal(off.announcement,null);
 const none=siteChrome({settings:undefined,primary:null,footer:null,path:'/'});
 assert.deepEqual([none.nav,none.social,none.announcement],[[],[],null]);
});

test('links to the old storefront domain become site paths; other links are kept or dropped',()=>{
 assert.equal(localHref('https://www.customseda.com/collections/bikinis'),'/collections/bikinis');
 assert.equal(localHref('https://customseda.com/pages/contact?x=1#a'),'/pages/contact?x=1#a');
 assert.equal(localHref('/pages/margarita'),'/pages/margarita');
 assert.equal(localHref('https://www.instagram.com/customseda/'),'https://www.instagram.com/customseda/');
 assert.equal(localHref('javascript:alert(1)'),undefined);
 assert.equal(localHref(null),undefined);
});

test('catalog entries map to cards at their retained public paths',()=>{
 const entry={id:'c1',slug:'tierra',status:'draft',refs:{},data:{title:'TIERRA',price_cents:5000,available:true,gallery:[
  {image:{id:'m',width:4,height:5,meta:{storageKey:'k.jpg'}},alt:'TIERRA 1'}]}};
 assert.deepEqual(productCard(entry),{href:'/products/tierra',title:'TIERRA',priceCents:5000,available:true,transitionName:'product-c1',
  images:[{id:'m',src:'/_emdash/api/media/file/k.jpg',alt:'TIERRA 1',width:4,height:5,position:'50% 50%'}]});
 assert.equal(productCard({...entry,data:{...entry.data,available:false}}).available,false);
});

test('single image fields map like gallery rows and settings are picked from the first entry',()=>{
 assert.deepEqual(imageView({id:'h',width:2048,height:1365,dominantColor:'rgb(1,2,3)',meta:{storageKey:'h.png'}},'Portada'),
  {id:'h',src:'/_emdash/api/media/file/h.png',alt:'Portada',width:2048,height:1365,position:'50% 50%',placeholder:'rgb(1,2,3)'});
 assert.equal(imageView(null,''),null);
 assert.equal(settingsOf({site_settings:[settings]}),settings);
 assert.equal(settingsOf({site_settings:[]}),undefined);
});

test('plain text summaries come from paragraph blocks and are trimmed on a word boundary',async()=>{
 const {plainText}=await import('../src/lib/shop/site.ts');
 const block=(text,style='normal')=>({_type:'block',style,children:[{_type:'span',text}]});
 const blocks=[block('PRIMERA COLECCIÓN','h2'),{_type:'image'},block('MARGARITA nace en Las Canteras, en Las Palmas.'),block('Segunda frase.')];
 assert.equal(plainText(blocks),'MARGARITA nace en Las Canteras, en Las Palmas. Segunda frase.');
 assert.equal(plainText(blocks,20),'MARGARITA nace en…');
 assert.equal(plainText(null),'');
});
