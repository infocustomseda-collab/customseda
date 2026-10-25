import test from 'node:test';
import assert from 'node:assert/strict';
import {portableTextFromHtml} from '../scripts/import/shopify-plan.mjs';
import {linkContacts,mainHtmlFromCapture,isUneditedImport} from '../scripts/import/page-structure.mjs';

const text=block=>block.children.map(s=>s.text).join('');

test('keeps headings relative to the top body heading, lists, emphasis and links',()=>{
 const blocks=portableTextFromHtml(`<p>Intro</p><h3>🚚 Envíos</h3><h4>Tiempos de Entrega</h4>
<ul>\n<li>\n<strong>Gran Canaria:</strong> 24/48 horas laborables.</li></ul>
<p><em>(Te contactaremos)</em></p>
<ol><li>Mail a <a href="mailto:info.customseda@gmail.com">info.customseda@gmail.com</a> para coordinar.</li></ol>`);
 assert.deepEqual(blocks.map(b=>[b.style,b.listItem??null,b.level??null,text(b)]),[
  ['normal',null,null,'Intro'],
  ['h2',null,null,'🚚 Envíos'],
  ['h3',null,null,'Tiempos de Entrega'],
  ['normal','bullet',1,'Gran Canaria: 24/48 horas laborables.'],
  ['normal',null,null,'(Te contactaremos)'],
  ['normal','number',1,'Mail a info.customseda@gmail.com para coordinar.'],
 ]);
 const item=blocks[3];
 assert.deepEqual(item.children.map(s=>[s.text,s.marks]),[['Gran Canaria:',['strong']],[' 24/48 horas laborables.',[]]]);
 assert.deepEqual(blocks[4].children[0].marks,['em']);
 const link=blocks[5];
 assert.equal(link.markDefs.length,1);
 assert.deepEqual(link.markDefs[0],{_type:'link',_key:link.markDefs[0]._key,href:'mailto:info.customseda@gmail.com'});
 assert.deepEqual(link.children.map(s=>s.marks),[[],[link.markDefs[0]._key],[]]);
});

test('places resolved images in document order and drops unresolved ones',()=>{
 const image=(src,alt)=>src.includes('pau')?{_type:'image',asset:{id:'m1',url:'/m1.png'},alt:alt||'Sobre Seda'}:null;
 const blocks=portableTextFromHtml('<img src="//x/pau.png" alt=""><h2>HOLA!</h2><p>Texto</p><img src="//x/other.jpg">',{image});
 assert.deepEqual(blocks.map(b=>b._type==='image'?['image',b.alt]:[b.style,text(b)]),[['image','Sobre Seda'],['h2','HOLA!'],['normal','Texto']]);
 assert.ok(blocks.every(b=>typeof b._key==='string'));
});

test('nested lists keep their level and line breaks split blocks',()=>{
 const blocks=portableTextFromHtml('<ul><li>Uno<ul><li>Dos</li></ul></li></ul><p>A<br>B</p><p><br></p>');
 assert.deepEqual(blocks.map(b=>[b.listItem??null,b.level??null,text(b)]),[['bullet',1,'Uno'],['bullet',2,'Dos'],[null,null,'A'],[null,null,'B']]);
});

test('links bare emails and WhatsApp numbers without touching existing links',()=>{
 const [block]=linkContacts(portableTextFromHtml('<p>WhatsApp al +34 686 65 97 11 o por Mail a <a href="mailto:a@b.es">a@b.es</a>, o escribe a info.customseda@gmail.com.</p>'));
 const hrefs=Object.fromEntries(block.markDefs.map(d=>[d._key,d.href]));
 const linked=block.children.filter(s=>s.marks.some(m=>hrefs[m])).map(s=>[s.text,hrefs[s.marks.find(m=>hrefs[m])]]);
 assert.deepEqual(linked,[['+34 686 65 97 11','https://wa.me/34686659711'],['a@b.es','mailto:a@b.es'],['info.customseda@gmail.com','mailto:info.customseda@gmail.com']]);
 assert.equal(text(block),'WhatsApp al +34 686 65 97 11 o por Mail a a@b.es, o escribe a info.customseda@gmail.com.');
});

test('extracts the main content without the page title, scripts or styles',()=>{
 const html='<header><h1>Logo</h1></header><main id="MainContent"><style>.x{}</style><h1 class="main-page-title">Envíos</h1><div class="rte"><p>Hola</p></div><script>bad()</script></main><footer><p>Pie</p></footer>';
 assert.equal(mainHtmlFromCapture(html).replace(/\s+/g,''),'<divclass="rte"><p>Hola</p></div>');
 assert.throws(()=>mainHtmlFromCapture('<p>no main</p>'),/main/);
});

test('treats a page as unedited only while its content still matches the flat import',()=>{
 const original='Hola\nMundo';
 const flat=original.split('\n').map((t,i)=>({_type:'block',_key:`p${i}`,style:'normal',markDefs:[],children:[{_type:'span',_key:`s${i}`,text:t,marks:[]}]}));
 assert.equal(isUneditedImport(flat,original),true);
 assert.equal(isUneditedImport([...flat,{_type:'image',_key:'image2',asset:{id:'m'}}],original),true);
 assert.equal(isUneditedImport([{...flat[0],style:'h2'},flat[1]],original),false);
 assert.equal(isUneditedImport(flat.slice(0,1),original),false);
 assert.equal(isUneditedImport(null,original),false);
});
