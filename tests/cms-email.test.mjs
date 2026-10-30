import assert from 'node:assert/strict';
import {test} from 'node:test';
import {cmsEmailSettings, cmsEmailBinding} from '../scripts/config/cms-email.mjs';
test('sending stays off until a sender domain is configured',()=>{
 assert.equal(cmsEmailSettings({},'staging'),null);
 assert.equal(cmsEmailSettings({env:{staging:{vars:{CMS_EMAIL_FROM:''}}}},'staging'),null);
});
test('sender is selected only from the explicit environment',()=>{
 const config={env:{staging:{vars:{CMS_EMAIL_FROM:'cms@example.com'}}}};
 assert.deepEqual(cmsEmailSettings(config,'staging'),{from:{email:'cms@example.com',name:'Custom Seda CMS'}});
 assert.equal(cmsEmailSettings(config,'production'),null);assert.equal(cmsEmailSettings(config,undefined),null);
});
test('real sending is limited to the confirmed owner, including during local development',()=>{
 const binding=cmsEmailBinding('cms@example.com',true);
 assert.deepEqual(binding,{name:'EMAIL',allowed_destination_addresses:['87c21@live.it'],allowed_sender_addresses:['cms@example.com'],remote:true});
 assert.equal('destination_address' in binding,false);
});
