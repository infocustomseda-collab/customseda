import test from 'node:test';
import assert from 'node:assert/strict';
import {remoteModelConfig} from '../scripts/cms/remote-model.mjs';
import {deploymentCommands} from '../scripts/deploy/target.mjs';
const target={environment:'staging',accountId:'a'.repeat(32),databaseId:'12345678-1234-1234-1234-123456789abc',origin:'https://staging.example.com',preview:{environment:'staging-preview',origin:'https://preview.example.com'}};
test('catalog remote proxy has one explicit remote D1 binding and no application bindings',()=>{
 const config=remoteModelConfig(target);
 assert.equal(config.d1_databases.length,1);
 assert.equal(config.d1_databases[0].database_id,target.databaseId);
 assert.equal(config.d1_databases[0].remote,true);
 assert.equal(config.vars,undefined);assert.equal(config.r2_buckets,undefined);
 assert.throws(()=>remoteModelConfig({...target,environment:'local'}));
});
test('catalog migration runs after core migrations and before Worker deployment',()=>{
 const commands=deploymentCommands(target);
 const catalog=commands.findIndex(c=>c[0]==='catalog-model');
 assert.ok(catalog>0);
 assert.ok(catalog<commands.findIndex(c=>c[0]==='wrangler'));
 assert.equal(commands[catalog-1][0],'emdash');
});
