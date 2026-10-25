// Restores the rich-text structure of pages that the first import stored as flat paragraphs.
const textBlocks=content=>content.filter(b=>b?._type==='block');

// The page body from a saved storefront capture: <main> without the page title, styles and scripts.
export function mainHtmlFromCapture(html) {
 const main=/<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(html)?.[1];
 if(main===undefined) throw new Error('Capture has no <main> element.');
 return main.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,'').replace(/<link\b[^>]*>/gi,'').replace(/<h1\b[^>]*>[\s\S]*?<\/h1>/i,'').trim();
}

// True while the stored blocks are still exactly the flat paragraphs of the first import, so a
// restore never overwrites an editor's work. Images were appended by that import and are ignored.
export function isUneditedImport(content,originalText) {
 if(!Array.isArray(content)) return false;
 const lines=String(originalText??'').split('\n').filter(Boolean);
 const blocks=textBlocks(content);
 return blocks.length===lines.length&&blocks.every((b,i)=>b.style==='normal'&&!b.listItem&&b.children?.length===1&&!b.children[0].marks?.length&&b.children[0].text===lines[i]);
}

// Makes bare emails and Spanish phone numbers tappable; a number in a block that mentions
// WhatsApp opens a WhatsApp chat. Text that is already a link is left alone.
const contact=/[\w.+-]+@[\w-]+(?:\.[\w-]+)+|\+34(?: ?\d){9}/g;
export function linkContacts(blocks) {
 return blocks.map(block=>{
  if(block._type!=='block') return block;
  const linkKeys=new Set(block.markDefs.filter(d=>d._type==='link').map(d=>d._key));
  const whatsapp=/whatsapp/i.test(block.children.map(s=>s.text).join(''));
  const markDefs=[...block.markDefs],children=[];
  for(const span of block.children) {
   if(span.marks.some(m=>linkKeys.has(m))) {children.push(span);continue;}
   let at=0;
   for(const match of span.text.matchAll(contact)) {
    const value=match[0],key=`${block._key}c${markDefs.length}`;
    const href=value.includes('@')?`mailto:${value}`:whatsapp?`https://wa.me/${value.replace(/\D/g,'')}`:`tel:${value.replace(/ /g,'')}`;
    if(match.index>at) children.push({...span,text:span.text.slice(at,match.index)});
    markDefs.push({_type:'link',_key:key,href});
    children.push({...span,text:value,marks:[...span.marks,key]});
    at=match.index+value.length;
   }
   if(at<span.text.length) children.push({...span,text:span.text.slice(at)});
  }
  return {...block,markDefs,children:children.map((s,j)=>({...s,_key:`${block._key}_${j}`}))};
 });
}
