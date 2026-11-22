const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const app=fs.readFileSync(require('node:path').join(__dirname,'../app.js'),'utf8');
const section=(start,end)=>app.slice(app.indexOf(start),app.indexOf(end,app.indexOf(start)));
test('cruising unrelated aircraft does not claim to approach KSU',()=>{
 const c=vm.createContext({
  nm:x=>x,dist:()=>43,trackHistory:new Map(),planeKey:()=>'aircraft',
  movementDestination:()=>null,getTrackDeg:p=>p.track??0,bearingBetween:()=>210,
  angleDiff:()=>8,confirmedKsuArrival:()=>false,courseLabel:()=> 'sørvest',
  Number,Math,Date
 });
 vm.runInContext(section('function ksuMovementStatus','function movementText'),c);
 const result=c.ksuMovementStatus({d:43,alt:40025,track:208,vr:0,lat:63,lon:8});
 assert.equal(result.label,'Passerer regionen');
});
test('confirmed KSU approach gets supported status',()=>{
 const c=vm.createContext({
  nm:x=>x,dist:()=>40,trackHistory:new Map(),planeKey:()=>'plane',
  movementDestination:()=>null,getTrackDeg:p=>p.track,bearingBetween:()=>210,
  angleDiff:()=>8,confirmedKsuArrival:()=>true,courseLabel:()=> 'sørvest',
  Number,Math,Date
 });
 vm.runInContext(section('function ksuMovementStatus','function movementText'),c);
 assert.equal(c.ksuMovementStatus({d:42,alt:12000,track:208,vr:-100,lat:63,lon:8}).label,'På vei til KSU');
});
test('focused aircraft outside automatic target bounds is included without a button',()=>{
 assert.match(app,/const focused=selectedVesselTypeKey\?'':selected&&list\.find/);
 assert.match(app,/if\(focusedPoint&&!bounds\.contains\(focusedPoint\)\)bounds\.extend\(focusedPoint\)/);
 assert.match(app,/const focusedOutside=Boolean\(focusedPoint&&!inside\.contains\(focusedPoint\)\)/);
 assert.match(app,/now<manualMapUntil\)return/);
});
test('manual map button and its listener are removed',()=>{
 assert.doesNotMatch(app,/show-aircraft-on-map/);
 assert.doesNotMatch(app,/showSelectedAircraftOnMap/);
 assert.doesNotMatch(app,/updateShowAircraftOnMapButton/);
});
test('aircraft motion animation and existing smart-map targets remain intact',()=>{
 assert.match(app,/function animateAircraftMotion/);
 assert.match(app,/function smartMapCandidate/);
 assert.match(app,/function fitMap\(list,s\)/);
 assert.match(app,/if\(autoFit\) fitMap\(list,s\)/);
});
