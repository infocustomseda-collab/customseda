import test from 'node:test';
import assert from 'node:assert/strict';
import {parseOrder,quoteOrder,sessionParams} from '../src/lib/commerce/checkout.ts';
import {shippingRules,shippingCost,addressCheck} from '../src/lib/commerce/shipping.ts';

const entry=(id,data={},refs={})=>({id,slug:id,status:'published',data:{title:id.toUpperCase(),price_cents:1000,available:true,gallery:[],...data},refs});
const piece=(id,cat,sizes,extra={})=>entry(id,extra,{category:[cat],collection:['col'],color:['c'],sizes:sizes.map(s=>`s-${s}`)});
const rule=(id,data)=>entry(id,{enabled:true,price_cents:630,description:'24/48 h',...data});
const shop=()=>({
 categories:[entry('cat-top',{code:'top'}),entry('cat-bottom',{code:'braguita'})],
 collections:[entry('col',{code:'margarita',title:'Margarita'})],
 colors:[entry('c',{code:'caoba'})],
 sizes:['XS','S','M','L','XL'].map(code=>entry(`s-${code}`,{code})),
 products:[
  piece('top-tierra','cat-top',['S','M','L'],{title:'Top Tierra',price_cents:3000}),
  piece('braguita-curve','cat-bottom',['XS','S','M'],{title:'Braguita Curve',price_cents:2500}),
  piece('top-agotado','cat-top',['S'],{available:false}),
  piece('top-gratis','cat-top',['S'],{price_cents:0}),
 ],
 conjuntos:[
  entry('tierra',{title:'Conjunto Tierra',price_cents:5000},{top:['top-tierra'],bottom:['braguita-curve']}),
  entry('mixto',{title:'Mixto',price_cents:4000},{top:['top-agotado'],bottom:['braguita-curve']}),
 ],
 shipping_rules:[
  rule('canarias',{title:'Canarias',zone:'canarias',country_codes:'ES',postal_prefixes:'35, 38',free_above_cents:4500}),
  rule('peninsula',{title:'Península y Baleares',zone:'peninsula_baleares',country_codes:'es',postal_prefixes:'07,28',price_cents:1090,free_above_cents:7000}),
  rule('recogida',{title:'Recogida en Gran Canaria',zone:'pickup',price_cents:0}),
  rule('apagada',{title:'Apagada',zone:'international',country_codes:'FR',enabled:false}),
  rule('sin-paises',{title:'Sin países',zone:'international'}),
  rule('mal-pais',{title:'Mal país',zone:'international',country_codes:'UK1'}),
  rule('sin-prefijos',{title:'Canarias sin prefijos',zone:'canarias',country_codes:'ES'}),
  rule('mal-prefijo',{title:'Prefijo malo',zone:'peninsula_baleares',country_codes:'ES',postal_prefixes:'28,x7'}),
 ],
});
const form=fields=>{const data=new FormData();for(const [k,v] of Object.entries(fields)) data.set(k,String(v));return data;};

test('only enabled rules with a usable destination are offered in zone order; codes are normalized',()=>{
 const rules=shippingRules({shipping_rules:[...shop().shipping_rules].reverse()});
 assert.deepEqual(rules.map(r=>r.id),['canarias','peninsula','recogida']);
 assert.deepEqual(rules[0].countries,['ES']);
 assert.deepEqual(rules[0].postalPrefixes,['35','38']);
 assert.deepEqual(rules[1].countries,['ES']);
 assert.deepEqual(rules[2].countries,[]);
});

test('rules with malformed countries or postal prefixes, or Spanish zones without prefixes, are not offered',()=>{
 const ids=shippingRules(shop()).map(r=>r.id);
 for(const id of ['mal-pais','sin-prefijos','mal-prefijo']) assert.ok(!ids.includes(id),id);
});

test('shipping is free from the threshold upward',()=>{
 const [canarias,,pickup]=shippingRules(shop());
 assert.equal(shippingCost(canarias,4499),630);
 assert.equal(shippingCost(canarias,4500),0);
 assert.equal(shippingCost(pickup,100),0);
});

test('a delivered address must match the chosen rule country and postal prefix',()=>{
 const [canarias,peninsula,pickup]=shippingRules(shop());
 assert.equal(addressCheck(canarias,{country:'ES',postal_code:'35001'}),'ok');
 assert.equal(addressCheck(canarias,{country:'ES',postal_code:'28001'}),'revisar');
 assert.equal(addressCheck(peninsula,{country:'ES',postal_code:'38001'}),'revisar');
 assert.equal(addressCheck(canarias,{country:'PT',postal_code:'35001'}),'revisar');
 assert.equal(addressCheck(canarias,null),'revisar');
 assert.equal(addressCheck(pickup,null),'recogida');
});

test('order form fields are parsed strictly',()=>{
 assert.deepEqual(parseOrder(form({id:'tierra',talla_top:'M',talla_braguita:'S',quantity:2,shipping:'canarias',price:5000})),
  {id:'tierra',sizes:{talla:null,talla_top:'M',talla_braguita:'S'},quantity:2,shipping:'canarias',price:5000});
 assert.equal(parseOrder(form({id:'tierra',quantity:0,shipping:'canarias',price:5000})),null);
 assert.equal(parseOrder(form({id:'tierra',quantity:11,shipping:'canarias',price:5000})),null);
 assert.equal(parseOrder(form({id:'tierra',quantity:1.5,shipping:'canarias',price:5000})),null);
 assert.equal(parseOrder(form({id:'tierra',quantity:1,shipping:'canarias'})),null);
 assert.equal(parseOrder(form({quantity:1,shipping:'canarias',price:1})),null);
});

const order=(fields)=>parseOrder(form({quantity:1,shipping:'canarias',...fields}));

test('a piece is quoted from database prices with its size and shipping',()=>{
 const quote=quoteOrder(shop(),order({id:'top-tierra',talla:'M',price:3000,quantity:2}));
 assert.equal(quote.ok,true);
 assert.deepEqual(quote.line,{kind:'pieza',id:'top-tierra',slug:'top-tierra',title:'Top Tierra',detail:'Talla: M',unitCents:3000,quantity:2,subtotalCents:6000,
  components:[{role:'pieza',id:'top-tierra',title:'Top Tierra',size:'M'}]});
 assert.equal(quote.shipping.rule.id,'canarias');
 assert.equal(quote.shipping.cents,0);
 assert.equal(quote.totalCents,6000);
});

test('a Conjunto keeps both component sizes on one line',()=>{
 const quote=quoteOrder(shop(),order({id:'tierra',talla_top:'L',talla_braguita:'XS',price:5000}));
 assert.equal(quote.ok,true);
 assert.equal(quote.line.detail,'Top: L · Braguita: XS');
 assert.deepEqual(quote.line.components.map(c=>[c.role,c.id,c.size]),[['top','top-tierra','L'],['braguita','braguita-curve','XS']]);
 assert.equal(quote.shipping.cents,0);
});

test('unavailable items, unsupported sizes, stale prices and unknown shipping are refused',()=>{
 const code=fields=>quoteOrder(shop(),order(fields)).error;
 assert.equal(code({id:'nada',talla:'M',price:1000}),'unavailable');
 assert.equal(code({id:'top-agotado',talla:'S',price:1000}),'unavailable');
 // A Conjunto with an unavailable component cannot be bought.
 assert.equal(code({id:'mixto',talla_top:'S',talla_braguita:'S',price:4000}),'unavailable');
 // Below Stripe's minimum charge an item would be given away for the shipping cost.
 assert.equal(code({id:'top-gratis',talla:'S',price:0}),'unavailable');
 assert.equal(code({id:'top-tierra',talla:'XL',price:3000}),'size');
 assert.equal(code({id:'top-tierra',price:3000}),'size');
 assert.equal(code({id:'tierra',talla_top:'M',talla_braguita:'L',price:5000}),'size');
 assert.equal(code({id:'tierra',talla_top:'M',price:5000}),'size');
 assert.equal(code({id:'top-tierra',talla:'M',price:2000}),'price');
 assert.equal(code({id:'top-tierra',talla:'M',price:3000,shipping:'apagada'}),'shipping');
 assert.equal(code({id:'top-tierra',talla:'M',price:3000,shipping:'nada'}),'shipping');
});

test('Stripe session parameters carry one line item, shipping and readable production details',()=>{
 const quote=quoteOrder(shop(),order({id:'tierra',talla_top:'M',talla_braguita:'S',price:5000,shipping:'peninsula'}));
 const params=sessionParams(quote,'https://seda.example');
 assert.equal(params.mode,'payment');
 assert.equal(params.locale,'es');
 assert.deepEqual(params.line_items,[{quantity:1,price_data:{currency:'eur',unit_amount:5000,product_data:{name:'Conjunto Tierra',description:'Top: M · Braguita: S'}}}]);
 assert.deepEqual(params.shipping_options,[{shipping_rate_data:{type:'fixed_amount',display_name:'Península y Baleares',fixed_amount:{amount:1090,currency:'eur'}}}]);
 assert.deepEqual(params.shipping_address_collection,{allowed_countries:['ES']});
 assert.equal(params.success_url,'https://seda.example/checkout/gracias?session_id={CHECKOUT_SESSION_ID}');
 assert.equal(params.cancel_url,'https://seda.example/checkout/cancelado?producto=tierra');
 assert.equal(params.payment_intent_data.description,'1 × Conjunto Tierra (Top: M · Braguita: S) · Envío: Península y Baleares');
 const metadata=params.metadata;
 assert.deepEqual(params.payment_intent_data.metadata,metadata);
 assert.equal(metadata.source,'customseda');
 assert.equal(metadata.item_id,'tierra');
 assert.equal(metadata.top_id,'top-tierra');
 assert.equal(metadata.top_size,'M');
 assert.equal(metadata.braguita_id,'braguita-curve');
 assert.equal(metadata.braguita_size,'S');
 assert.equal(metadata.unit_price_cents,'5000');
 assert.equal(metadata.shipping_cents,'1090');
 assert.equal(metadata.total_cents,'6090');
 assert.equal(metadata.shipping_rule_id,'peninsula');
 assert.equal(metadata.shipping_countries,'ES');
 assert.equal(metadata.shipping_postal_prefixes,'07,28');
 // Stripe metadata limits: 50 keys, 40-character keys, 500-character string values.
 assert.ok(Object.keys(metadata).length<=50);
 for(const [key,value] of Object.entries(metadata)) {assert.ok(key.length<=40,key);assert.equal(typeof value,'string');assert.ok(value.length<=500,key);}
});

test('pickup collects no address and sends no shipping options',()=>{
 const quote=quoteOrder(shop(),order({id:'top-tierra',talla:'S',price:3000,shipping:'recogida'}));
 const params=sessionParams(quote,'https://seda.example');
 assert.equal(params.shipping_address_collection,undefined);
 // Stripe shipping options belong with address collection; pickup is in the description and metadata.
 assert.equal(params.shipping_options,undefined);
 assert.match(params.payment_intent_data.description,/Envío: Recogida en Gran Canaria/);
 assert.deepEqual(params.phone_number_collection,{enabled:true});
});
