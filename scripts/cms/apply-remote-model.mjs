import {readFile} from 'node:fs/promises';
import {validateTarget} from '../deploy/target.mjs';
import {withDeploymentLock} from '../deploy/lock.mjs';
import {remoteCatalogModel} from './remote-model.mjs';
try {
 const [environment,mode,...extra]=process.argv.slice(2);
 if(!['--check','--apply'].includes(mode)||extra.length) throw new Error('Usage: pnpm cms:model:remote staging|production --check|--apply');
 const target=validateTarget(JSON.parse(await readFile('wrangler.jsonc','utf8')),environment);
 console.log(`Catalog target: ${target.environment} | account ${target.accountId} | ${target.origin} | D1 ${target.databaseId}`);
 const run=()=>remoteCatalogModel(target,{check:mode==='--check'});
 const result=mode==='--check'?await run():await withDeploymentLock('.emdash',environment,run);
 console.log(`${result.version}: ${result.applied?'applied':'present'}.`);
} catch(error){console.error(error.message);process.exitCode=1;}
