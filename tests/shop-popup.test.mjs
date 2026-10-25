import test from 'node:test';
import assert from 'node:assert/strict';
import {shouldShowPopup,popupStorageKey} from '../src/lib/shop/popup.ts';
import {popupView} from '../src/lib/shop/site.ts';

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

test('enabled popups map to views; the first one still running is chosen',()=>{
 const entry=(id,data)=>({id,slug:id,status:'published',refs:{},data:{title:id,enabled:true,content:[],button_text:'Ver',button_url:'https://www.customseda.com/collections/bikinis',delay_seconds:3,dismiss_days:7,...data}});
 const popups=[entry('off',{enabled:false}),entry('ended',{ends_at:'2026-10-01T00:00:00Z'}),entry('envio',{starts_at:'2026-10-20T00:00:00Z'}),entry('later',{})];
 const view=popupView(popups,now);
 assert.deepEqual({...view,content:undefined},{id:'envio',title:'envio',content:undefined,image:null,button:{label:'Ver',href:'/collections/bikinis'},delaySeconds:3,schedule:{id:'envio',startsAt:'2026-10-20T00:00:00Z',endsAt:null,dismissDays:7}});
 assert.equal(popupView([entry('x',{button_text:'',delay_seconds:null,dismiss_days:null})],now).button,null);
 assert.equal(popupView([entry('x',{delay_seconds:null,dismiss_days:null})],now).delaySeconds,3);
 assert.equal(popupView([entry('x',{dismiss_days:-2})],now).schedule.dismissDays,7);
 assert.equal(popupView([],now),null);
});
