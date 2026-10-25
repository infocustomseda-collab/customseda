import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {formEncode,stripeRequest,verifyWebhook} from '../src/lib/commerce/stripe.ts';

test('nested parameters are form-encoded with bracket keys',()=>{
 const body=formEncode({mode:'payment',line_items:[{quantity:1,price_data:{unit_amount:5000}}],metadata:{a:'x y'},skip:undefined,flag:true});
 assert.equal(decodeURIComponent(body),'mode=payment&line_items[0][quantity]=1&line_items[0][price_data][unit_amount]=5000&metadata[a]=x+y&flag=true');
 assert.equal(new URLSearchParams(body).get('line_items[0][price_data][unit_amount]'),'5000');
});

test('requests authenticate with the secret key and surface Stripe errors',async()=>{
 const calls=[];
 const ok=async(url,init)=>{calls.push([url,init]);return Response.json({id:'cs_1',url:'https://checkout.stripe.com/c/pay/cs_1'});};
 const session=await stripeRequest({secretKey:'sk_test_1',fetch:ok},'POST','/v1/checkout/sessions',{mode:'payment'});
 assert.equal(session.id,'cs_1');
 assert.equal(calls[0][0],'https://api.stripe.com/v1/checkout/sessions');
 assert.equal(calls[0][1].headers.Authorization,'Bearer sk_test_1');
 assert.equal(calls[0][1].headers['Content-Type'],'application/x-www-form-urlencoded');
 assert.equal(calls[0][1].body,'mode=payment');
 const failing=async()=>Response.json({error:{message:'No such price'}},{status:400});
 await assert.rejects(()=>stripeRequest({secretKey:'sk_test_1',fetch:failing},'GET','/v1/checkout/sessions/x'),/Stripe 400: No such price/);
});

const secret='whsec_test';
const sign=(payload,t,key=secret)=>`t=${t},v1=${createHmac('sha256',key).update(`${t}.${payload}`).digest('hex')}`;

test('webhooks verify the signature within the tolerance window',async()=>{
 const payload=JSON.stringify({id:'evt_1',type:'checkout.session.completed'});
 const now=1_800_000_000;
 assert.equal((await verifyWebhook(payload,sign(payload,now),secret,now+10)).id,'evt_1');
 // Several v1 signatures may be present during secret rotation.
 assert.equal((await verifyWebhook(payload,`${sign(payload,now,'whsec_old')},v1=${sign(payload,now).split('v1=')[1]}`,secret,now)).id,'evt_1');
 await assert.rejects(()=>verifyWebhook(payload,sign(payload,now,'whsec_other'),secret,now),/signature/);
 await assert.rejects(()=>verifyWebhook(payload+' ',sign(payload,now),secret,now),/signature/);
 await assert.rejects(()=>verifyWebhook(payload,sign(payload,now),secret,now+301),/tolerance/);
 await assert.rejects(()=>verifyWebhook(payload,'',secret,now),/signature/);
});
