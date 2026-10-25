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

test('deploys queue per environment instead of cancelling a running one',()=>{
 for(const name of ['staging','production']) {
  const block=job(name);
  assert.match(block,new RegExp(`group: deploy-${name}\\n\\s+cancel-in-progress: false`),name);
  assert.match(block,new RegExp(`environment: ${name}\\n`),name);
  assert.match(block,new RegExp(`run: pnpm deploy:${name}\\n`),name);
 }
});

test('production runs only when enabled, and after staging on pushes',()=>{
 const block=job('production');
 assert.match(block,/vars\.PRODUCTION_DEPLOY_ENABLED == 'true'/);
 assert.match(block,/needs: \[verify, staging\]/);
 assert.match(block,/needs\.staging\.result == 'success'/);
});

test('secrets reach only the deploy step environment and are never printed',()=>{
 assert.doesNotMatch(workflow,/echo[^\n]*secrets\./);
 assert.match(workflow,/CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/);
 assert.match(workflow,/EMDASH_EXPECTED_TARGET_FINGERPRINT: \$\{\{ vars\.EMDASH_TARGET_FINGERPRINT \}\}/);
 assert.match(job('verify'),/run: pnpm test\n/);
 assert.doesNotMatch(job('verify'),/secrets\./);
});
