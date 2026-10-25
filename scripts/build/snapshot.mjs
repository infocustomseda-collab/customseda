import {mkdir,writeFile,rename} from 'node:fs/promises';
import {dirname} from 'node:path';
import {openBindings} from './bindings.mjs';
import {SNAPSHOT_PATH,assertPublishable,createSnapshot} from '../../src/lib/shop/snapshot.ts';

const ENVIRONMENTS=['local','staging','production'];

/** Reads one environment's published content and writes the build snapshot atomically. */
export async function writeSnapshot({environment,allowEmpty=false,drafts=false,open=openBindings,path=SNAPSHOT_PATH}) {
 if(!ENVIRONMENTS.includes(environment)) throw new Error('Choose --env local, staging or production.');
 const bindings=await open(environment);
 try {
  const snapshot=await createSnapshot(bindings.db,environment,{drafts});
  assertPublishable(snapshot,{environment,allowEmpty});
  await mkdir(dirname(path),{recursive:true});
  await writeFile(`${path}.tmp`,JSON.stringify(snapshot));
  await rename(`${path}.tmp`,path);
  const {shop}=snapshot;
  console.log(`Snapshot ${environment}: ${shop.products.length} products, ${shop.conjuntos.length} Conjuntos, ${shop.pages.length} pages, ${shop.shipping_rules.length} shipping rules.`);
  return snapshot;
 } finally {await bindings.dispose();}
}

if(import.meta.url===`file://${process.argv[1]}`) {
 const args=process.argv.slice(2);
 const environment=args[args.indexOf('--env')+1];
 if(args.indexOf('--env')<0||args.some(a=>!['--env','--allow-empty','--drafts',environment].includes(a))) {
  console.error('Usage: pnpm snapshot --env local|staging|production [--allow-empty] [--drafts (local only)]');process.exitCode=1;
 } else writeSnapshot({environment,allowEmpty:args.includes('--allow-empty'),drafts:args.includes('--drafts')}).catch(error=>{console.error(error.message);process.exitCode=1;});
}
