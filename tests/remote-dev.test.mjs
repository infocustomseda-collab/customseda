import assert from 'node:assert/strict';
import {test} from 'node:test';
import {remoteDevConfig, remoteDevEnv} from '../scripts/dev/remote.mjs';
const config={account_id:'a'.repeat(32),compatibility_date:'2026-10-22',compatibility_flags:['nodejs_compat'],env:{}};
for(const [i,name] of ['staging','production'].entries())config.env[name]={vars:{FOUNDATION_LOCKED:'true',GITHUB_REPOSITORY:'repo',SITE_ROLE:'public'},d1_databases:[{binding:'DB',database_name:name,database_id:`${i+1}2345678-1234-1234-1234-123456789abc`}],r2_buckets:[{binding:'MEDIA',bucket_name:`${name}-media`}],kv_namespaces:[{binding:'SESSION',id:'remote-session'}]};
test('each local server binds exactly the selected remote database and bucket',()=>{
 for(const name of ['staging','production']) {
  const c=remoteDevConfig(config,name,'/project');
  assert.equal(c.d1_databases[0].database_id,config.env[name].d1_databases[0].database_id);
  assert.equal(c.r2_buckets[0].bucket_name,`${name}-media`);
  assert.equal(c.d1_databases[0].remote,true);assert.equal(c.r2_buckets[0].remote,true);
  assert.equal(c.vars.EMDASH_SITE_URL,'http://localhost:4321');
  assert.equal(c.vars.FOUNDATION_LOCKED,'false');assert.equal(c.vars.GITHUB_REPOSITORY,undefined);
  assert.deepEqual(c.kv_namespaces,[{binding:'SESSION'}]);assert.equal(c.triggers,undefined);
 }
});
test('remote dev refuses unspecified or incomplete targets',()=>{
 for(const e of [undefined,'local','prod'])assert.throws(()=>remoteDevConfig(config,e,'/project'));
 const c=structuredClone(config);delete c.env.production.d1_databases[0].database_id;
 assert.throws(()=>remoteDevConfig(c,'production','/project'),/database/);
});
test('parent environment cannot select a deployed env or leak live secrets into local runtime',()=>{
 const env=remoteDevEnv({PATH:'/bin',CLOUDFLARE_ENV:'production',STRIPE_SECRET_KEY:'live',GITHUB_REBUILD_TOKEN:'token'},'staging','/config',{EMDASH_ENCRYPTION_KEY:'key',STRIPE_SECRET_KEY:'live'});
 assert.equal(env.CLOUDFLARE_ENV,undefined);assert.equal(env.STRIPE_SECRET_KEY,undefined);assert.equal(env.GITHUB_REBUILD_TOKEN,undefined);
 assert.equal(env.EMDASH_ENCRYPTION_KEY,'key');assert.equal(env.CUSTOMSEDA_REMOTE_DEV,'staging');
});
test('staging reads production data, so remote dev refuses it and points to production',()=>{
 const c=structuredClone(config);c.env.staging.vars.CMS_ORIGIN='https://cms.example';
 assert.throws(()=>remoteDevConfig(c,'staging','/project'),/dev:production/);
});
