import test from 'node:test';
import assert from 'node:assert/strict';
import {Kysely,sql} from 'kysely';
import {createDialect} from 'emdash/db/sqlite';
import {runMigrations} from 'emdash/db';
import {applyCheckoutModel,checkoutVersion,handleStripeEvent} from '../src/lib/commerce/payments.ts';

async function database(t) {
 const db=new Kysely({dialect:createDialect({url:':memory:'})});t.after(()=>db.destroy());
 await runMigrations(db);
 assert.deepEqual(await applyCheckoutModel(db),{version:checkoutVersion,applied:true});
 assert.deepEqual(await applyCheckoutModel(db),{version:checkoutVersion,applied:false});
 return db;
}
const rows=async db=>(await sql`SELECT event_id,type,session_id,payment_intent_id,status,address_check,livemode FROM customseda_payment_events ORDER BY stripe_created`.execute(db)).rows.map(r=>({...r}));
const metadata={source:'customseda',item_id:'tierra',shipping_rule_id:'canarias',shipping_zone:'canarias',shipping_countries:'ES',shipping_postal_prefixes:'35,38'};
const session=(extra={})=>({id:'cs_1',object:'checkout.session',payment_intent:'pi_1',payment_status:'paid',metadata,
 collected_information:{shipping_details:{name:'Ana',address:{country:'ES',postal_code:'35001',line1:'Calle 1'}}},customer_details:{email:'ana@example.com'},...extra});
const event=(id,type,object,created=1)=>({id,type,created,livemode:false,data:{object}});

test('a paid session is recorded once with no personal data, and duplicates are ignored',async t=>{
 const db=await database(t);
 const flags=[];
 const flag=async(...args)=>{flags.push(args);};
 assert.equal(await handleStripeEvent(db,event('evt_1','checkout.session.completed',session()),{flagPaymentIntent:flag}),'recorded');
 assert.equal(await handleStripeEvent(db,event('evt_1','checkout.session.completed',session()),{flagPaymentIntent:flag}),'duplicate');
 assert.deepEqual(await rows(db),[{event_id:'evt_1',type:'checkout.session.completed',session_id:'cs_1',payment_intent_id:'pi_1',status:'paid',address_check:'ok',livemode:0}]);
 assert.deepEqual(flags,[]);
 const columns=(await sql`PRAGMA table_info(customseda_payment_events)`.execute(db)).rows.map(r=>r.name);
 for(const personal of ['email','name','address','phone']) assert.ok(!columns.some(c=>c!=='address_check'&&c.includes(personal)),personal);
});

test('delayed payments move from pending to paid or failed; expiry and unrelated events are handled',async t=>{
 const db=await database(t);
 const flagPaymentIntent=async()=>{};
 await handleStripeEvent(db,event('evt_1','checkout.session.completed',session({payment_status:'unpaid'}),1),{flagPaymentIntent});
 await handleStripeEvent(db,event('evt_2','checkout.session.async_payment_succeeded',session(),2),{flagPaymentIntent});
 await handleStripeEvent(db,event('evt_3','checkout.session.async_payment_failed',session({id:'cs_2',payment_intent:'pi_2',payment_status:'unpaid'}),3),{flagPaymentIntent});
 await handleStripeEvent(db,event('evt_4','checkout.session.expired',session({id:'cs_3',payment_intent:null,payment_status:'unpaid',collected_information:null}),4),{flagPaymentIntent});
 assert.equal(await handleStripeEvent(db,event('evt_5','charge.refunded',{id:'ch_1'},5),{flagPaymentIntent}),'ignored');
 assert.deepEqual((await rows(db)).map(r=>[r.event_id,r.status]),[['evt_1','pending'],['evt_2','paid'],['evt_3','failed'],['evt_4','expired']]);
});

test('an address outside the chosen shipping rule flags the payment for review before recording',async t=>{
 const db=await database(t);
 const flags=[];
 const wrong=session({collected_information:null,shipping_details:{address:{country:'ES',postal_code:'28001'}}});
 await handleStripeEvent(db,event('evt_1','checkout.session.completed',wrong),{flagPaymentIntent:async(...args)=>{flags.push(args);}});
 assert.deepEqual(flags,[['pi_1','canarias','28001']]);
 assert.equal((await rows(db))[0].address_check,'revisar');
 // A failing flag leaves the event unrecorded so Stripe retries it.
 const failing=async()=>{throw new Error('Stripe 500');};
 await assert.rejects(()=>handleStripeEvent(db,event('evt_2','checkout.session.completed',{...wrong,id:'cs_9'}),{flagPaymentIntent:failing}),/Stripe 500/);
 assert.equal((await rows(db)).length,1);
});

test('pickup sessions are marked as pickup without an address',async t=>{
 const db=await database(t);
 const pickup=session({collected_information:null,metadata:{...metadata,shipping_zone:'pickup',shipping_countries:'',shipping_postal_prefixes:''}});
 await handleStripeEvent(db,event('evt_1','checkout.session.completed',pickup),{flagPaymentIntent:async()=>assert.fail('no flag')});
 assert.equal((await rows(db))[0].address_check,'recogida');
});

test('sessions created elsewhere in the Stripe account are ignored without side effects',async t=>{
 const db=await database(t);
 const foreign=session({metadata:{},collected_information:null});
 assert.equal(await handleStripeEvent(db,event('evt_1','checkout.session.completed',foreign),{flagPaymentIntent:async()=>assert.fail('no flag')}),'ignored');
 assert.deepEqual(await rows(db),[]);
});
