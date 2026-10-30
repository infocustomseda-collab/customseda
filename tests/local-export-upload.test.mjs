import assert from 'node:assert/strict';
import {test} from 'node:test';
import {knownLengthUpload} from '../scripts/cms/local-export-upload.mjs';
test('remote R2 receives bytes with a known length while other upload metadata is preserved',async()=>{
 const input={key:'probe',contentType:'text/plain',body:new ReadableStream({start(c){c.enqueue(new Uint8Array([1,2]));c.enqueue(new Uint8Array([3]));c.close();}})};
 const result=await knownLengthUpload(input,10);
 assert.equal(result.key,'probe');assert.equal(result.contentType,'text/plain');assert.deepEqual([...result.body],[1,2,3]);
});
test('oversize streams are cancelled before an upload can start',async()=>{
 let cancelled=false;
 const body=new ReadableStream({start(c){c.enqueue(new Uint8Array(11));},cancel(){cancelled=true;}});
 await assert.rejects(knownLengthUpload({body},10),/exceeds/);assert.equal(cancelled,true);
});
