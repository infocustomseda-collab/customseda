import {mkdir,readFile,writeFile,rename,rm,copyFile,access,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,join} from 'node:path';
import sharp from 'sharp';
import {openBindings} from './bindings.mjs';
import {SNAPSHOT_PATH} from '../../src/lib/shop/snapshot.ts';
import {annotateImages,collectImages,derivativeSrc,derivativeWidths} from '../../src/lib/shop/images.ts';

const OUTPUT='public';
const CACHE='.cache/media';
// Workers static assets on Free: 20,000 files and 25 MiB each; keep headroom for the rest of the site.
const MAX_FILES=15000,MAX_BYTES=25*1024*1024;
const exists=path=>access(path).then(()=>true,()=>false);

/** Derivatives for one original; the cache is keyed by content hash so unchanged photos are free. */
async function derive(key,bytes) {
 const hash=createHash('sha256').update(bytes).digest('hex').slice(0,24);
 const {width,height}=await sharp(bytes).rotate().metadata().then(m=>m.autoOrient??m);
 const derivatives=[];
 for(const target of derivativeWidths(width)) {
  const cached=join(CACHE,`${hash}-${target}.webp`);
  if(!await exists(cached)) await sharp(bytes).rotate().resize({width:target,withoutEnlargement:true}).webp({quality:75}).toFile(`${cached}.tmp`).then(()=>rename(`${cached}.tmp`,cached));
  const src=derivativeSrc(key,target);
  if((await stat(cached)).size>MAX_BYTES) throw new Error(`${src} is larger than 25 MiB.`);
  await copyFile(cached,join(OUTPUT,src));
  derivatives.push({width:target,src});
 }
 return {width,height,derivatives};
}

/** Writes public/media/* for every snapshot image and annotates the snapshot with them. */
export async function buildImages({environment,open=openBindings,concurrency=4}) {
 const snapshot=JSON.parse(await readFile(SNAPSHOT_PATH,'utf8'));
 if(snapshot.environment!==environment) throw new Error(`Snapshot is from ${snapshot.environment}, not ${environment}.`);
 const started=Date.now();
 await rm(join(OUTPUT,'media'),{recursive:true,force:true});
 await mkdir(join(OUTPUT,'media'),{recursive:true});await mkdir(CACHE,{recursive:true});
 const images=collectImages(snapshot),generated=new Map(),skipped=[];
 const bindings=await open(environment);
 try {
  const queue=[...images];
  await Promise.all(Array.from({length:concurrency},async()=>{
   for(let image;(image=queue.shift());) {
    try {
     const object=await bindings.media.get(image.key);
     if(!object) {skipped.push(`${image.key}: missing in R2`);continue;}
     generated.set(image.key,await derive(image.key,Buffer.from(await object.arrayBuffer())));
    } catch(error) {
     if(/larger than 25 MiB/.test(error.message)) throw error;
     skipped.push(`${image.key}: ${error.message}`);
    }
   }
  }));
 } finally {await bindings.dispose();}
 const files=[...generated.values()].flatMap(g=>g.derivatives);
 if(files.length>MAX_FILES) throw new Error(`${files.length} derivatives exceed the ${MAX_FILES}-file budget.`);
 let bytes=0;for(const file of files) bytes+=(await stat(join(OUTPUT,file.src))).size;
 const annotated=annotateImages(snapshot,generated);
 await mkdir(dirname(SNAPSHOT_PATH),{recursive:true});
 await writeFile(`${SNAPSHOT_PATH}.tmp`,JSON.stringify(annotated));await rename(`${SNAPSHOT_PATH}.tmp`,SNAPSHOT_PATH);
 const report={images:images.length,derivatives:files.length,bytes,seconds:Math.round((Date.now()-started)/100)/10,skipped};
 console.log(`Images ${environment}: ${report.images} originals → ${report.derivatives} WebP files, ${(bytes/1048576).toFixed(1)} MiB in ${report.seconds}s.`);
 for(const line of skipped) console.warn(`  kept original (no derivatives): ${line}`);
 return report;
}

if(import.meta.url===`file://${process.argv[1]}`) {
 const args=process.argv.slice(2);
 const environment=args[args.indexOf('--env')+1];
 if(args.length!==2||args[0]!=='--env') {console.error('Usage: node scripts/build/images.mjs --env local|staging|production');process.exitCode=1;}
 else buildImages({environment}).catch(error=>{console.error(error.message);process.exitCode=1;});
}
