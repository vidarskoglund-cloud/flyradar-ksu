const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const file=fs.readFileSync(path.join(__dirname,'../speedboat-schedule.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
function initialize(){
 const ctx={console,Date,Math,Number,String,
  window:{},document:{getElementById:()=>null}};
 vm.runInNewContext(file,ctx);
 return ctx.window.KsuSpeedboatSchedule;
}
const sched=initialize();
const time='2026-11-22T18:00:00+01:00';
const when=Date.parse(time);
function call(options={}){
 return {line:{publicCode:'800',transportMode:'water'},
  forBoarding:true,forAlighting:false,realtime:false,cancellation:false,predictionInaccurate:false,
  aimedDepartureTime:'2026-11-22T19:30:00+01:00',
  expectedDepartureTime:'2026-11-22T19:30:00+01:00',
  destinationDisplay:{frontText:'Trondheim'},...options};
}
test('field appears directly beneath flights in desktop and mobile',()=>{
 assert.match(html,/<div id="avinor-list-side"><\/div><\/div>\s*<div class="speedboat-side">/);
 assert.match(html,/<section class="schedule speedboat-regular">/);
 assert.match(html,/id="speedboat-list"/);
 assert.match(html,/id="speedboat-list-side"/);
 assert.match(html,/speedboat-schedule\.js\?v=1/);
});
test('only AtB speedboat route 800 is shown, not bus or another line',()=>{
 const rows=sched.toRows([call(),call({line:{publicCode:'801',transportMode:'water'}}),
  call({line:{publicCode:'800',transportMode:'bus'}})],when);
 assert.equal(rows.length,1);
 assert.equal(rows[0].code,'800');
 assert.equal(rows[0].direction,'AVG');
 assert.equal(rows[0].changed,false);
});
test('a revised time is shown as such only for realtime and actual change',()=>{
 const revised='2026-11-22T19:45:00+01:00';
 let rows=sched.toRows([call({realtime:true,expectedDepartureTime:revised})],when);
 assert.equal(rows[0].changed,true);assert.equal(rows[0].delayed,true);
 rows=sched.toRows([call({realtime:false,expectedDepartureTime:revised})],when);
 assert.equal(rows[0].changed,false);
 rows=sched.toRows([call({realtime:true,expectedDepartureTime:revised,predictionInaccurate:true})],when);
 assert.equal(rows[0].changed,false);
});
test('arrival-only calls are supported; cancelled and completed calls are ignored',()=>{
 const arr=call({forBoarding:false,forAlighting:true,aimedArrivalTime:'2026-11-22T19:15:00+01:00',expectedArrivalTime:'2026-11-22T19:15:00+01:00'});
 const rows=sched.toRows([arr,call({cancellation:true}),call({actualDepartureTime:'2026-11-22T19:30:00+01:00'})],when);
 assert.equal(rows.length,1);assert.equal(rows[0].direction,'ANK');
});
test('no vessel identity or timetable is guessed from AIS',()=>{
 assert.doesNotMatch(file,/\bTR?ANEN\b/);
 assert.match(file,/No ship\/vessel assignment is inferred/);
 assert.match(file,/ET-Client-Name/);
 assert.match(file,/geocoder\/v3\/autocomplete/);
 assert.match(file,/journey-planner\/v3\/graphql/);
});
test('only exact named Kristiansund speedboat stop is accepted',()=>{
 const valid={properties:{id:'NSR:StopPlace:999',names:{default:'Kristiansund hurtigbåtkai'}},geometry:{coordinates:[7.73,63.11]}};
 assert.equal(sched.pickKristiansundQuay([valid]),'NSR:StopPlace:999');
 assert.equal(sched.pickKristiansundQuay([{...valid,geometry:{coordinates:[10,59]}}]),null);
 assert.equal(sched.pickKristiansundQuay([valid,valid]),null);
});
