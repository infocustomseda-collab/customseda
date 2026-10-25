import test from 'node:test';
import assert from 'node:assert/strict';
import {shouldShowPopup,popupStorageKey,choosePopup} from '../src/lib/shop/popup.ts';
import {popupViews} from '../src/lib/shop/site.ts';

const day=86_400_000;
const now=Date.parse('2026-10-25T12:00:00Z');
const schedule={id:'p1',startsAt:null,endsAt:null,dismissDays:7};

test('a popup shows inside its window unless dismissed within the dismissal period',()=>{
 assert.equal(shouldShowPopup(schedule,now,null),true);
 assert.equal(shouldShowPopup({...schedule,startsAt:'2026-10-26T00:00:00Z'},now,null),false);
 assert.equal(shouldShowPopup({...schedule,endsAt:'2026-10-25T11:59:59Z'},now,null),false);
 assert.equal(shouldShowPopup({...schedule,startsAt:'2026-10-01T00:00:00Z',endsAt:'2026-11-01T00:00:00Z'},now,null),true);
 assert.equal(shouldShowPopup(schedule,now,now-6*day),false);
 assert.equal(shouldShowPopup(schedule,now,now-7*day),true);
 // Zero days: show again on the next visit; unparseable dates never block.
 assert.equal(shouldShowPopup({...schedule,dismissDays:0},now,now-1000),true);
 assert.equal(shouldShowPopup({...schedule,startsAt:'mañana'},now,null),true);
 assert.equal(popupStorageKey('p1'),'seda:popup:p1:dismissed');
});

test('every enabled, unexpired popup is rendered; a later-scheduled one never hides the running one',()=>{
 const entry=(id,data)=>({id,slug:id,status:'published',refs:{},data:{title:id,enabled:true,content:[],button_text:'Ver',button_url:'https://www.customseda.com/collections/bikinis',delay_seconds:3,dismiss_days:7,...data}});
 // findMany returns newest first: the future "rebajas" popup comes before the running one.
 const popups=[entry('rebajas',{starts_at:'2026-11-01T00:00:00Z'}),entry('off',{enabled:false}),entry('ended',{ends_at:'2026-10-01T00:00:00Z'}),entry('envio',{starts_at:'2026-10-20T00:00:00Z'})];
 const views=popupViews(popups,now);
 assert.deepEqual(views.map(v=>v.id),['rebajas','envio']);
 assert.deepEqual({...views[1],content:undefined},{id:'envio',title:'envio',content:undefined,image:null,button:{label:'Ver',href:'/collections/bikinis'},delaySeconds:3,schedule:{id:'envio',startsAt:'2026-10-20T00:00:00Z',endsAt:null,dismissDays:7}});
 const none=()=>null;
 assert.equal(choosePopup(views.map(v=>v.schedule),now,none)?.id,'envio');
 assert.equal(choosePopup(views.map(v=>v.schedule),Date.parse('2026-11-02T00:00:00Z'),none)?.id,'rebajas');
 assert.equal(choosePopup(views.map(v=>v.schedule),now,id=>id==='envio'?now:null),null);
 assert.equal(popupViews([entry('x',{button_text:'',delay_seconds:null,dismiss_days:null})],now)[0].button,null);
 assert.equal(popupViews([entry('x',{delay_seconds:null,dismiss_days:null})],now)[0].delaySeconds,3);
 assert.equal(popupViews([entry('x',{dismiss_days:-2})],now)[0].schedule.dismissDays,7);
 assert.deepEqual(popupViews([],now),[]);
});
