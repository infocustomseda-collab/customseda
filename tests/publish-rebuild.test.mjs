import test from 'node:test';
import assert from 'node:assert/strict';
import {Kysely,sql} from 'kysely';
import {createDialect} from 'emdash/db/sqlite';
import {runMigrations} from 'emdash/db';
import {ContentRepository} from 'emdash';
import {applyModelMigrations} from '../src/lib/cms/model-migration.ts';
import {REBUILD_COLLECTIONS,publishedSinceQuery,rebuildConfig,rebuildRequestAllowed,requestRebuild} from '../src/lib/publish/rebuild.ts';

const env={GITHUB_REBUILD_TOKEN:'github_pat_x',GITHUB_REPOSITORY:'infocustomseda-collab/customseda',DEPLOY_ENVIRONMENT:'staging'};

test('no config means no rebuild',()=>{
 assert.deepEqual(rebuildConfig(env),{token:'github_pat_x',repository:'infocustomseda-collab/customseda',environment:'staging'});
 for(const missing of ['GITHUB_REBUILD_TOKEN','GITHUB_REPOSITORY','DEPLOY_ENVIRONMENT']) assert.equal(rebuildConfig({...env,[missing]:undefined}),null,missing);
 assert.equal(rebuildConfig({...env,DEPLOY_ENVIRONMENT:'local'}),null);
 assert.equal(rebuildConfig({...env,GITHUB_REPOSITORY:'not a repo'}),null);
});

test('dispatch sends the environment and reason to the deploy workflow',async()=>{
 const calls=[];
 await requestRebuild(rebuildConfig(env),'content:afterPublish products',async(url,init)=>{calls.push([url,init]);return new Response(null,{status:204});});
 assert.equal(calls[0][0],'https://api.github.com/repos/infocustomseda-collab/customseda/actions/workflows/deploy.yml/dispatches');
 assert.equal(calls[0][1].method,'POST');
 assert.deepEqual(calls[0][1].headers,{Authorization:'Bearer github_pat_x',Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'customseda-rebuild','Content-Type':'application/json'});
 assert.deepEqual(JSON.parse(calls[0][1].body),{ref:'master',inputs:{environment:'staging',reason:'content:afterPublish products'}});
});

test('GitHub errors surface their message',async()=>{
 const failing=async()=>Response.json({message:'Workflow does not have workflow_dispatch trigger'},{status:422});
 await assert.rejects(()=>requestRebuild(rebuildConfig(env),'x',failing),/422: Workflow does not have/);
});

test('the rebuild route refuses non-admins and cross-origin calls',()=>{
 const ok={role:50,origin:'https://seda.example',requestOrigin:'https://seda.example',csrf:'1'};
 assert.equal(rebuildRequestAllowed(ok),true);
 assert.equal(rebuildRequestAllowed({...ok,role:40}),false);
 assert.equal(rebuildRequestAllowed({...ok,requestOrigin:'https://evil.example'}),false);
 assert.equal(rebuildRequestAllowed({...ok,csrf:null}),false);
});

test('scheduled publications in shop collections are counted since a time',async t=>{
 const db=new Kysely({dialect:createDialect({url:':memory:'})});t.after(()=>db.destroy());
 await runMigrations(db);await applyModelMigrations(db);
 // The model migration publishes lookup rows (sizes, categories); count only what follows.
 await new Promise(resolve=>setTimeout(resolve,20));
 const before=new Date().toISOString();
 const repo=new ContentRepository(db);
 const page=await repo.create({type:'pages',slug:'nueva',status:'published',data:{title:'Nueva'}});
 // As the scheduled sweep's publish does.
 await sql`UPDATE ec_pages SET published_at=${new Date().toISOString()} WHERE id=${page.id}`.execute(db);
 const count=async since=>{const {sql,params}=publishedSinceQuery();return Number((await db.executeQuery({sql,parameters:params(since),query:{kind:'RawNode'}})).rows[0].count);};
 assert.equal(await count(before),1);
 assert.equal(await count('2999-01-01T00:00:00.000Z'),0);
 assert.ok(REBUILD_COLLECTIONS.includes('pages') && REBUILD_COLLECTIONS.includes('shipping_rules'));
 assert.ok(page.id);
});

test('publishing, unpublishing and deleting shop content requests a rebuild; drafts do not',async t=>{
 const {fixture}=await import('./helpers/catalog.mjs');
 const reasons=[];
 const f=await fixture(t,{onContentChange:reason=>reasons.push(reason)});
 const settle=()=>new Promise(resolve=>setTimeout(resolve,50));
 await settle();
 assert.ok(reasons.includes('publish products'),JSON.stringify(reasons));
 reasons.length=0;
 // Saving a draft (the Conjunto created by the fixture) is not a public change.
 await f.runtime.handleContentUpdate('conjuntos',f.bundle,{data:{title:'Otro título'}});
 await settle();
 assert.deepEqual(reasons,[]);
 assert.equal((await f.runtime.handleContentPublish('conjuntos',f.bundle)).success,true);
 await f.runtime.handleContentUnpublish('conjuntos',f.bundle);
 await f.runtime.handleContentDelete('conjuntos',f.bundle);
 await settle();
 assert.deepEqual(reasons,['publish conjuntos','unpublish conjuntos','delete conjuntos']);
});
