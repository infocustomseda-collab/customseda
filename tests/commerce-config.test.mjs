import assert from 'node:assert/strict';
import {test} from 'node:test';
import {configuredStripeSecrets,stripeEventMatchesMode,stripeMode} from '../src/lib/commerce/stripe-config.ts';

test('staging and local runtimes reject live keys, including restricted keys',()=>{
 for(const bindings of [{},{SITE_ROLE:'preview'},{SITE_ROLE:'public',CMS_ORIGIN:'https://cms.example'}]) {
  assert.equal(stripeMode(bindings),'test');
  for(const kind of ['sk','rk']) {
   assert.deepEqual(configuredStripeSecrets({...bindings,STRIPE_SECRET_KEY:`${kind}_live_secret`,STRIPE_WEBHOOK_SECRET:'whsec_secret'}),{});
   assert.equal(configuredStripeSecrets({...bindings,STRIPE_SECRET_KEY:`${kind}_test_secret`}).STRIPE_SECRET_KEY,`${kind}_test_secret`);
  }
 }
});

test('production accepts live secrets and rejects test or publishable keys',()=>{
 const bindings={SITE_ROLE:'public'};
 assert.equal(stripeMode(bindings),'live');
 for(const kind of ['sk','rk'])assert.equal(configuredStripeSecrets({...bindings,STRIPE_SECRET_KEY:`${kind}_live_secret`}).STRIPE_SECRET_KEY,`${kind}_live_secret`);
 for(const key of [undefined,'sk_test_secret','rk_test_secret','pk_live_public','invalid','sk_live_'])assert.deepEqual(configuredStripeSecrets({...bindings,STRIPE_SECRET_KEY:key}),{});
});

test('only webhook signing secrets are accepted and unrelated bindings are never returned',()=>{
 const bindings={SITE_ROLE:'preview',STRIPE_SECRET_KEY:'rk_test_secret',STRIPE_WEBHOOK_SECRET:'whsec_secret',EMDASH_ENCRYPTION_KEY:'private'};
 assert.deepEqual(configuredStripeSecrets(bindings),{STRIPE_SECRET_KEY:'rk_test_secret',STRIPE_WEBHOOK_SECRET:'whsec_secret'});
 for(const secret of [undefined,'','sk_test_secret','whsec_'])assert.equal(configuredStripeSecrets({...bindings,STRIPE_WEBHOOK_SECRET:secret}).STRIPE_WEBHOOK_SECRET,undefined);
});

test('webhook events cannot cross test and live environments',()=>{
 for(const bindings of [{},{SITE_ROLE:'preview'},{SITE_ROLE:'public',CMS_ORIGIN:'https://cms.example'}]) {
  assert.equal(stripeEventMatchesMode(bindings,{livemode:false}),true);
  assert.equal(stripeEventMatchesMode(bindings,{livemode:true}),false);
 }
 assert.equal(stripeEventMatchesMode({SITE_ROLE:'public'},{livemode:true}),true);
 assert.equal(stripeEventMatchesMode({SITE_ROLE:'public'},{livemode:false}),false);
 assert.equal(stripeEventMatchesMode({SITE_ROLE:'public'},{livemode:undefined}),false);
});
