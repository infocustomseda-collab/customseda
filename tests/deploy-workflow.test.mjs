import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const workflow=await readFile('.github/workflows/deploy.yml','utf8').catch(()=>'');
// Each job's block: from its key to the next top-level job key.
const job=name=>{const start=workflow.indexOf(`\n  ${name}:\n`);assert.ok(start>=0,`job ${name}`);const rest=workflow.slice(start+1);const next=rest.slice(1).search(/\n  [a-z-]+:\n/);return next<0?rest:rest.slice(0,next+1);};

test('the workflow deploys on pushes to master and on demand per environment',()=>{
 assert.match(workflow,/on:\n  push:\n    branches: \[master\]/);
 assert.match(workflow,/workflow_dispatch:/);
 assert.match(workflow,/environment:\n        description:[^\n]*\n        type: choice\n        options: \[staging, production\]/);
});

test('both deploys queue on the shared production database instead of cancelling a running one',()=>{
 for(const name of ['staging','production']) {
  const block=job(name);
  assert.match(block,/group: deploy-production-db\n\s+cancel-in-progress: false/,name);
  assert.match(block,new RegExp(`environment: ${name}\\n`),name);
  assert.match(block,new RegExp(`run: pnpm deploy:${name}\\n`),name);
 }
});

test('staging runs after a successful production deploy on pushes',()=>{
 const production=job('production');
 assert.match(production,/vars\.PRODUCTION_DEPLOY_ENABLED == 'true'/);
 assert.match(production,/needs: \[verify\]\n/);
 const staging=job('staging');
 assert.match(staging,/needs: \[verify, production\]/);
 assert.match(staging,/needs\.production\.result == 'success'/);
 // Staging reads production's database: it never deploys code that production has not migrated for.
 assert.doesNotMatch(staging,/needs\.production\.result == 'cancelled'/);
 // A cancelled run stops; always() would keep staging running.
 assert.doesNotMatch(workflow,/always\(\)/);
 assert.match(staging,/!cancelled\(\)/);
});

test('CMS dispatches coalesce before any job starts and skip the push-only verification',()=>{
 assert.match(workflow,/\nconcurrency:\n  group: \$\{\{ github\.event_name == 'workflow_dispatch' && format\('dispatch-\{0\}', inputs\.environment\) \|\| format\('push-\{0\}', github\.run_id\) \}\}\n  cancel-in-progress: false/);
 assert.match(job('verify'),/if: github\.event_name == 'push'/);
 assert.match(job('production'),/needs\.verify\.result == 'skipped'/);
});

test('deploy jobs deploy the current master, never an older run commit',()=>{
 for(const name of ['staging','production']) assert.match(job(name),/uses: actions\/checkout@v4\n        with:\n          ref: master/,name);
});

test('pnpm comes from packageManager only (action-setup fails when both are set)',()=>{
 assert.doesNotMatch(workflow,/pnpm\/action-setup@v4\n        with:\n          version:/);
});

test('secrets reach only the deploy step environment and are never printed',()=>{
 assert.doesNotMatch(workflow,/echo[^\n]*secrets\./);
 assert.match(workflow,/CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/);
 assert.match(workflow,/EMDASH_EXPECTED_TARGET_FINGERPRINT: \$\{\{ vars\.EMDASH_TARGET_FINGERPRINT \}\}/);
 assert.match(job('verify'),/run: pnpm test\n/);
 assert.doesNotMatch(job('verify'),/secrets\./);
});

test('staging deploys only once enabled, so pushes stay green before the GitHub setup exists',()=>{
 assert.match(job('staging'),/vars\.STAGING_DEPLOY_ENABLED == 'true'/);
});
