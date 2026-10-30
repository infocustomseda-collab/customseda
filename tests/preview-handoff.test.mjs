import assert from 'node:assert/strict';
import { test } from 'node:test';
import { issuePreviewHandoff, consumePreviewHandoff, previewPath } from '../src/lib/preview-handoff.ts';

function store() {
 const rows=new Map();
 return { async setVersioned(k,v){rows.set(k,{value:v,revision:'rev'});return 'rev';}, async getVersioned(k){return rows.get(k)??null;}, async compareAndDelete(k,r){if(rows.get(k)?.revision!==r)return {applied:false};rows.delete(k);return {applied:true};} };
}
test('handoff is single use and bound to an existing editor session',async()=>{
 const db=store();const token=await issuePreviewHandoff(db,'session-id','/products/marea',100);
 assert.match(token,/^[a-f0-9]{64}$/);
 assert.deepEqual(await consumePreviewHandoff(db,token,101),{sessionId:'session-id',path:'/products/marea'});
 assert.equal(await consumePreviewHandoff(db,token,102),null);
});
test('expired, missing and tampered handoffs are refused',async()=>{
 const db=store();const token=await issuePreviewHandoff(db,'session-id','/',100);
 assert.equal(await consumePreviewHandoff(db,token,60101),null);
 assert.equal(await consumePreviewHandoff(db,'x'.repeat(64),101),null);
 assert.equal(await consumePreviewHandoff(db,'a'.repeat(64),101),null);
});
test('only relative storefront paths can be preview destinations',()=>{
 for(const p of ['https://evil.example','//evil.example','/\\evil.example','/_emdash/admin','/preview/access','/api/checkout'])assert.equal(previewPath(p),'/');
 assert.equal(previewPath('/products/marea?x=1'),'/products/marea?x=1');
});
