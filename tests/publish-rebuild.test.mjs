import test from 'node:test';
import assert from 'node:assert/strict';
import {Kysely,sql} from 'kysely';
import {createDialect} from 'emdash/db/sqlite';
import {runMigrations} from 'emdash/db';
import {ContentRepository} from 'emdash';
import {applyModelMigrations} from '../src/lib/cms/model-migration.ts';
import {REBUILD_COLLECTIONS,rebuildConfig,rebuildRequestAllowed,requestRebuild,scheduledRebuildReasons} from '../src/lib/publish/rebuild.ts';

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

// Minimal D1 surface over the in-memory SQLite database, as the Worker's scheduled handler uses it.
const d1=db=>({prepare:sql=>{let params=[];const stmt={bind:(...values)=>{params=values;return stmt;},
 all:async()=>({results:(await db.executeQuery({sql,parameters:params,query:{kind:'RawNode'}})).rows}),
 first:async()=>(await db.executeQuery({sql,parameters:params,query:{kind:'RawNode'}})).rows[0]??null,
 run:async()=>{await db.executeQuery({sql,parameters:params,query:{kind:'RawNode'}});return {success:true};}};return stmt;}});

test('due scheduled changes and menu edits trigger the scheduled rebuild; quiet hours do not',async t=>{
 const db=new Kysely({dialect:createDialect({url:':memory:'})});t.after(()=>db.destroy());
 await runMigrations(db);await applyModelMigrations(db);
 const now=Date.parse('2026-10-25T12:00:00.000Z');
 const check=()=>scheduledRebuildReasons(d1(db),now);
 // First run only records the menu fingerprint.
 assert.deepEqual(await check(),[]);
 assert.deepEqual(await check(),[]);
 // A scheduled edit of a live product keeps its old published_at; scheduled_at is what is due.
 const page=await new ContentRepository(db).create({type:'pages',slug:'nueva',status:'published',data:{title:'Nueva'}});
 await sql`UPDATE ec_pages SET scheduled_at=${'2026-10-25T11:30:00.000Z'} WHERE id=${page.id}`.execute(db);
 assert.deepEqual(await check(),['scheduled publish']);
 await sql`UPDATE ec_pages SET scheduled_at=${'2026-10-25T13:00:00.000Z'} WHERE id=${page.id}`.execute(db);
 assert.deepEqual(await check(),[]);
 // Menu items have no updated_at: a label edit is caught by the fingerprint.
 await sql`INSERT INTO _emdash_menus (id,name,label,locale,translation_group) VALUES ('m1','primary','Principal','es','m1')`.execute(db);
 assert.deepEqual(await check(),['menu change']);
 assert.deepEqual(await check(),[]);
 await sql`INSERT INTO _emdash_menu_items (id,menu_id,sort_order,type,custom_url,label) VALUES ('i1','m1',0,'custom','/','Inicio')`.execute(db);
 assert.deepEqual(await check(),['menu change']);
 await sql`UPDATE _emdash_menu_items SET label='Portada' WHERE id='i1'`.execute(db);
 assert.deepEqual(await check(),['menu change']);
 assert.ok(REBUILD_COLLECTIONS.includes('pages') && REBUILD_COLLECTIONS.includes('shipping_rules'));
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
 await f.runtime.handleContentUpdate('products',f.bundle,{data:{title:'Otro título'}});
 await settle();
 assert.deepEqual(reasons,[]);
 assert.equal((await f.runtime.handleContentPublish('products',f.bundle)).success,true);
 await f.runtime.handleContentUnpublish('products',f.bundle);
 await f.runtime.handleContentDelete('products',f.bundle);
 await settle();
 assert.deepEqual(reasons,['publish products','unpublish products','delete products']);
});

test('native category edits and published category assignments trigger a scheduled rebuild',async t=>{
 const db=new Kysely({dialect:createDialect({url:':memory:'})});t.after(()=>db.destroy());
 await runMigrations(db);await applyModelMigrations(db);
 const check=()=>scheduledRebuildReasons(d1(db),Date.now());
 assert.deepEqual(await check(),[]);
 const term=await db.selectFrom('taxonomies').selectAll().where('slug','=','top').executeTakeFirstOrThrow();
 await db.updateTable('taxonomies').set({label:'Tops'}).where('id','=',term.id).execute();
 assert.deepEqual(await check(),['taxonomy change']);assert.deepEqual(await check(),[]);
 const entry=await new ContentRepository(db).create({type:'products',slug:'classified',status:'published',data:{title:'Classified'}});
 await db.insertInto('content_taxonomies').values({collection:'products',entry_id:entry.translationGroup??entry.id,taxonomy_id:term.translation_group??term.id}).execute();
 assert.deepEqual(await check(),['taxonomy change']);
});
