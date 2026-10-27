// Copy original CMS bytes out of local R2. This never changes CMS records or storage keys.
import {mkdir,writeFile} from 'node:fs/promises';
import {basename,join} from 'node:path';
import {createHash} from 'node:crypto';
import {openBindings} from '../build/bindings.mjs';
import {loadShop} from '../../src/lib/shop/content.ts';

async function main() {
 if(process.argv.length!==2) throw new Error('Usage: pnpm media:originals (local only)');
 const bindings=await openBindings('local');
 try {
  const shop=await loadShop(bindings.db,{drafts:true});
  const productIds=new Set();
  const walk=value=>{
   if(Array.isArray(value)) {for(const child of value) walk(child);return;}
   if(!value||typeof value!=='object') return;
   if(typeof value.id==='string') productIds.add(value.id);
   for(const child of Object.values(value)) walk(child);
  };
  walk(shop.products);
  const rows=await bindings.db.selectFrom('media').selectAll().orderBy('id').execute();
  const manifest=[];
  for(const row of rows) {
   // Initial infrastructure probe, not storefront photography.
   if(row.filename==='foundation-smoke.png') continue;
   const object=await bindings.media.get(row.storage_key);
   if(!object) throw new Error(`Missing local original: ${row.filename}`);
   const bytes=Buffer.from(await object.arrayBuffer());
   if(bytes.length!==row.size) throw new Error(`Size mismatch: ${row.filename}`);
   const sha256=createHash('sha256').update(bytes).digest('hex');
   const folder=productIds.has(row.id)?'products':'site';
   const path=join(folder,`${basename(row.storage_key)}--${basename(row.filename)}`);
   const output=join('assets/originals',path);
   await mkdir(join('assets/originals',folder),{recursive:true});
   await writeFile(output,bytes);
   manifest.push({id:row.id,key:row.storage_key,filename:row.filename,path,bytes:bytes.length,sha256});
  }
  await writeFile('assets/originals/manifest.json',JSON.stringify({version:1,files:manifest},null,2)+'\n');
  console.log(`Preserved ${manifest.length} originals (${manifest.reduce((n,f)=>n+f.bytes,0)} bytes); ${manifest.filter(f=>f.path.startsWith('products/')).length} catalog images.`);
 } finally {await bindings.dispose();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
