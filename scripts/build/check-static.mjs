import {readdir,readFile} from 'node:fs/promises';
import {join,relative} from 'node:path';

// EmDash answers with plain-text errors (e.g. pending migrations) that prerendering would save as pages.
const ERROR_TEXT=/Database migrations are required|database schema is unavailable/i;

async function htmlFiles(dir) {
 const entries=await readdir(dir,{withFileTypes:true,recursive:true});
 return entries.filter(e=>e.isFile()&&e.name.endsWith('.html')).map(e=>join(e.parentPath??e.path,e.name));
}

/** Refuses a static build whose pages are error responses instead of documents. */
export async function checkStaticBuild(dir='dist/client') {
 const files=await htmlFiles(dir);
 const names=files.map(file=>relative(dir,file));
 for(const required of ['index.html','404.html']) if(!names.includes(required)) throw new Error(`Static build is missing ${required}.`);
 const broken=[];
 for(const file of files) {
  const html=await readFile(file,'utf8');
  // Astro's redirect documents use a doctype and omit the optional <html> tag.
  if(ERROR_TEXT.test(html)||!/(<html[\s>]|^\s*<!doctype\s+html>)/i.test(html)) broken.push(relative(dir,file));
 }
 if(broken.length) throw new Error(`Prerendered pages are not documents (EmDash error responses?): ${broken.slice(0,10).join(', ')}${broken.length>10?` and ${broken.length-10} more`:''}.`);
 return {pages:files.length};
}

if(import.meta.url===`file://${process.argv[1]}`) checkStaticBuild().then(r=>console.log(`Static build: ${r.pages} pages checked.`),error=>{console.error(error.message);process.exitCode=1;});
