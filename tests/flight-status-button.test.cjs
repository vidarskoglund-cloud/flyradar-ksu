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
test('map button is hidden when selected aircraft is inside visible bounds',()=>{
 const c=vm.createContext({
  map:{getBounds:()=>({pad:()=>({contains:point=>point[0]===63&&point[1]===8})}),on:()=>{}},
  planeKey:p=>p.hex,motionMarkers:new Map(),selectedVesselTypeKey:'',
  selected:{hex:'a',lat:63,lon:8},Number,
  $:()=>({hidden:false})
 });
 vm.runInContext(section('function selectedAircraftVisibleOnMap','function showSelectedAircraftOnMap'),c);
 assert.equal(c.selectedAircraftVisibleOnMap(c.selected),true);
 assert.equal(c.selectedAircraftVisibleOnMap({lat:61,lon:9,hex:'b'}),false);
});
test('button is refreshed after map moves and airplane animation',()=>{
 assert.match(app,/map\.on\('moveend zoomend',updateShowAircraftOnMapButton\)/);
 assert.match(app,/function animateAircraftMotion[\s\S]*?updateShowAircraftOnMapButton\(\)/);
 assert.match(app,/id="show-aircraft-on-map" \$\{selectedAircraftVisibleOnMap\(shown\)/);
});
