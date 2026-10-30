import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseEnv} from 'node:util';
import {spawn} from 'node:child_process';
import {cmsEmailSettings,cmsEmailBinding} from '../config/cms-email.mjs';

export function remoteDevConfig(config,environment,root) {
 if(!['staging','production'].includes(environment))throw new Error('Choose staging or production explicitly.');
 if(!/^[a-f0-9]{32}$/i.test(config.account_id??''))throw new Error('Missing Cloudflare account.');
 const target=config.env?.[environment];
 // Staging has no data of its own: a local CMS for it would edit production.
 if(target?.vars?.CMS_ORIGIN)throw new Error(`${environment} reads production's data and has no CMS; use pnpm dev:production.`);
 const database=target?.d1_databases?.find(b=>b.binding==='DB');
 const bucket=target?.r2_buckets?.find(b=>b.binding==='MEDIA');
 if(!/^(?!00000000-0000-0000-0000-000000000000$)[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(database?.database_id??''))throw new Error(`Missing ${environment} database UUID.`);
 if(!bucket?.bucket_name)throw new Error(`Missing ${environment} media bucket.`);
 const email=cmsEmailSettings(config,environment);
 return {
  name:`customseda-dev-${environment}`,main:resolve(root,'src/worker.ts'),account_id:config.account_id,
  compatibility_date:config.compatibility_date,compatibility_flags:config.compatibility_flags,
  workers_dev:false,
  vars:{EMDASH_SITE_URL:'http://localhost:4321',FOUNDATION_LOCKED:'false',SITE_ROLE:'preview'},
  d1_databases:[{binding:'DB',database_name:database.database_name,database_id:database.database_id,remote:true}],
  r2_buckets:[{binding:'MEDIA',bucket_name:bucket.bucket_name,remote:true}],
  kv_namespaces:[{binding:'SESSION'}],
  secrets:{required:['EMDASH_ENCRYPTION_KEY']},
  ...(email ? {send_email:[cmsEmailBinding(email.from.email,true)]} : {}),
 };
}

export function remoteDevEnv(parent,environment,configPath,secrets) {
 const {CLOUDFLARE_ENV:_env,STRIPE_SECRET_KEY:_stripe,STRIPE_WEBHOOK_SECRET:_webhook,GITHUB_REBUILD_TOKEN:_rebuild,...rest}=parent;
 return {...rest,EMDASH_ENCRYPTION_KEY:secrets.EMDASH_ENCRYPTION_KEY,
  CUSTOMSEDA_REMOTE_DEV:environment,CUSTOMSEDA_DEV_WRANGLER:configPath,SITE_MODE:'preview'};
}

async function main() {
 const [environment,...extra]=process.argv.slice(2);
 if(extra.length)throw new Error('Usage: pnpm dev:production (stop the other dev server first).');
 const root=process.cwd();
 const source=JSON.parse(await readFile(resolve(root,'wrangler.jsonc'),'utf8'));
 const config=remoteDevConfig(source,environment,root);
 const secretPath=resolve(root,`.env.cloudflare-${environment}`);
 const secrets=parseEnv(await readFile(secretPath,'utf8').catch(()=>{throw new Error(`Missing .env.cloudflare-${environment}; provide the selected Worker's EMDASH_ENCRYPTION_KEY there.`);}));
 if(!secrets.EMDASH_ENCRYPTION_KEY)throw new Error(`Missing EMDASH_ENCRYPTION_KEY in .env.cloudflare-${environment}.`);
 const configPath=resolve(root,'.emdash',`dev-${environment}`,'wrangler.json');
 await mkdir(dirname(configPath),{recursive:true});
 await writeFile(configPath,JSON.stringify(config,null,2),{mode:0o600});
 console.log(`Local execution → ${environment}: D1 ${config.d1_databases[0].database_name} (${config.d1_databases[0].database_id}); R2 ${config.r2_buckets[0].bucket_name}.`);
 console.log('CMS writes affect those REMOTE resources. Sessions stay local; automatic migrations and rebuild dispatches are disabled.');
 const child=spawn('pnpm',['exec','astro','dev','--host','127.0.0.1','--port','4321'],{cwd:root,env:remoteDevEnv(process.env,environment,configPath,secrets),stdio:'inherit'});
 for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
 child.on('error',error=>{console.error(error.message);process.exitCode=1;});
 child.on('exit',(code,signal)=>{process.exitCode=code??(signal==='SIGINT'?0:1);});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{console.error(error.message);process.exitCode=1;});
