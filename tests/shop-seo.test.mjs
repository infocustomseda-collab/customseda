import test from 'node:test';
import assert from 'node:assert/strict';
import {collectionCanonicalPath,llmsText,productStructuredData,publicPath,sitemapPaths,sitemapXml} from '../src/lib/shop/seo.ts';
import {productDetail} from '../src/lib/shop/detail.ts';
import {withMaterials} from './helpers/shop.mjs';

const entry=(id,data={},refs={})=>({id,slug:id,status:'published',data:{title:id,price_cents:1000,gallery:[],...data},refs});
const piece=(id,cat,sizes,data={})=>entry(id,data,{category:[cat],collection:['col'],color:['c'],sizes:sizes.map(s=>`s-${s}`)});
const text=value=>[{_type:'block',children:[{_type:'span',text:value}]}];
const shop=(settings={})=>withMaterials({
 categories:[entry('cat-mujeres',{code:'mujeres',title:'Mujeres'}),entry('cat-top',{code:'top'}),entry('cat-bottom',{code:'braguita'}),entry('cat-sets',{code:'conjuntos',title:'Conjuntos'})].map(term=>({...term,slug:term.data.code})),
 collections:[entry('col',{code:'margarita',title:'Margarita'})],
 colors:[{...entry('c',{title:'Caoba'}),slug:'caoba'}],
 sizes:['S','M'].map(code=>entry(`s-${code}`,{code:`any-${code}`,label:code})),
 size_guides:[],
 products:[piece('top-luz','cat-top',['S'],{title:'Top [Luz]',price_cents:3000,description:text('Top de\nlycra <suave> & doble capa.')}),piece('top-agotado','cat-top',[])],
 pages:[entry('seda',{title:'Sobre Seda'}),entry('privacy-policy',{title:'Política de privacidad'})],
 site_settings:[entry('settings',{title:'Seda — contenido actual',hero_text:'Bikinis hechos a mano en Gran Canaria.',contact_email:'hola@seda.example',...settings})],popups:[],shipping_rules:[],
});
const site=new URL('https://seda.example');

test('the sitemap lists home, listings, products and public page paths, never CMS root slugs',()=>{
 const paths=sitemapPaths(shop());
 assert.equal(paths[0],'/');
 assert.ok(paths.includes('/collections/bikinis'));
 assert.ok(paths.includes('/products/top-luz'));
 assert.ok(paths.includes('/pages/seda'));
 assert.ok(paths.includes('/policies/privacy-policy'));
 assert.ok(!paths.includes('/seda'));
 // The singular Braguitas alias is not listed; its page points to the public plural URL.
 assert.ok(paths.includes('/collections/braguitas')&&!paths.includes('/collections/braguita'));
 assert.equal(collectionCanonicalPath(shop(),'braguita'),'/collections/braguitas');
 assert.equal(collectionCanonicalPath(shop(),'top'),'/collections/top');
 assert.equal(collectionCanonicalPath(shop(),'bikinis'),'/collections/bikinis');
 // Bikinis is the public URL of the mujeres listing.
 assert.ok(!paths.includes('/collections/mujeres'));
 assert.equal(collectionCanonicalPath(shop(),'mujeres'),'/collections/bikinis');
 assert.equal(new Set(paths).size,paths.length);
 const xml=sitemapXml(['/','/products/a&b'],site);
 assert.match(xml,/^<\?xml version="1.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9">/);
 assert.ok(xml.includes('<url><loc>https://seda.example/</loc></url>'));
 assert.ok(xml.includes('<loc>https://seda.example/products/a&amp;b</loc>'));
});

test('llms.txt uses CMS text with absolute links, prices and one-line descriptions',()=>{
 const body=llmsText(shop(),site);
 assert.ok(body.startsWith('# Seda\n\n> Bikinis hechos a mano en Gran Canaria.\n\nContacto: hola@seda.example\n\n## Colecciones\n\n'));
 assert.ok(body.includes('- [Bikinis](https://seda.example/collections/bikinis)'));
 assert.match(body,/- \[Top Luz\]\(https:\/\/seda\.example\/products\/top-luz\): 30,00\s€\. Top de lycra <suave> & doble capa\.\n/);
 assert.ok(body.includes('## Información\n\n- [Sobre Seda](https://seda.example/pages/seda)\n- [Política de privacidad](https://seda.example/policies/privacy-policy)\n'));
 assert.ok(body.endsWith('\n'));
 // No summary or contact line without CMS values.
 assert.ok(llmsText(shop({hero_text:'',contact_email:''}),site).startsWith('# Seda\n\n## Colecciones'));
});

test('product structured data carries one EUR offer, made to order only when available',()=>{
 const options={url:'https://seda.example/products/top-luz',images:['https://seda.example/a.jpg'],description:'Top',brand:'Seda'};
 const data=productStructuredData(productDetail(shop(),'top-luz'),options);
 assert.deepEqual(data,{'@context':'https://schema.org','@type':'Product',name:'Top [Luz]',description:'Top',image:['https://seda.example/a.jpg'],color:'Caoba',url:options.url,
  brand:{'@type':'Brand',name:'Seda'},
  offers:{'@type':'Offer',url:options.url,price:'30.00',priceCurrency:'EUR',itemCondition:'https://schema.org/NewCondition',availability:'https://schema.org/MadeToOrder'}});
 const soldOut=productStructuredData(productDetail(shop(),'top-agotado'),{...options,images:[],description:''});
 assert.equal(soldOut.offers.availability,'https://schema.org/OutOfStock');
 assert.ok(!('image' in soldOut)&&!('description' in soldOut));
});

test('public paths drop the prerendered .html file name',()=>{
 assert.equal(publicPath('/products/marea.html'),'/products/marea');
 assert.equal(publicPath('/index.html'),'/');
 assert.equal(publicPath('/pages/seda'),'/pages/seda');
 assert.equal(publicPath('/'),'/');
});
