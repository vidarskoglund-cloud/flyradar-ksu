const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
function extract(start,end){
  const a=source.indexOf(start),b=source.indexOf(end,a+start.length);
  assert.ok(a>=0&&b>a,'Expected code section: '+start);
  return source.slice(a,b);
}
function ctx(){
 const c=vm.createContext({
   Date,Math,Number,Map,Set,
   vessels:[],smartGroundStillSince:new Map(),
   ksuDistanceNm:p=>p.distance,
   ksuFlightInfo:p=>p.ksuFlight?{direction:p.ksuFlight,status:'Planlagt'}:null,
   confirmedKsuArrival:p=>p.ksuFlight==='Ankomst KSU',
   ksuApproachContext:()=>null,
   getTrackDeg:p=>p.track??null,
   bearingBetween:()=>0,angleDiff:(a,b)=>Math.abs(a-b),
   ksuMovementStatus:()=>({label:'Passerer'}),
   isGroundOrTaxi:()=>false,
   smartPlaneIdentity:p=>'fly:'+p.hex,
   nm:x=>x,dist:()=>0,
   movingHarborVessel:v=>v,
   VESSEL_HARBOR_CENTER:[63.1115,7.7600]
 });
 vm.runInContext('const IDLE_GLIMPSE_CYCLE_MS=90000,IDLE_GLIMPSE_FROM_MS=60000,IDLE_GLIMPSE_TO_MS=75000;let idleGlimpseSince=null;const mapAreas={city:{lat:63.11,lon:7.74}};',c);
 vm.runInContext(extract('function smartMapCandidate','function fitMap'),c);
 return c;
}
const plane=(distance,overrides={})=>({
 hex:'aircraft'+distance,lat:63.11,lon:7.82,distance,alt:5000,gs:170,track:90,...overrides
});
test('passing aircraft beyond 25 NM does not take map focus',()=>{
 const c=ctx();
 assert.equal(c.smartMapCandidate([plane(38.9)]).length,0);
});
test('local traffic gets moderate focus at 10-25 NM',()=>{
 const c=ctx(),target=c.smartMapCandidate([plane(18)])[0];
 assert.equal(target.maxZoom,10);
 assert.ok(target.rank>=3);
});
test('aircraft under 10 NM gets closer focus',()=>{
 const c=ctx(),target=c.smartMapCandidate([plane(7)])[0];
 assert.equal(target.maxZoom,12);
 assert.ok(target.rank>3);
});
test('confirmed KSU arrival takes priority even from 38 NM',()=>{
 const c=ctx();
 c.vessels=[{key:'boat',lat:63.12,lon:7.7,d:1,rank:2.8,inHarbor:true}];
 const result=c.smartMapCandidate([plane(38,{ksuFlight:'Ankomst KSU'}),plane(7)]);
 assert.equal(result[0].d,38);
 assert.ok(result.some(item=>item.key==='bat:boat'));
});
test('existing map focus hold, manual pause and 50 NM count are retained',()=>{
 assert.match(source,/SMART_MAP_HOLD_MS=30000/);
 assert.match(source,/SMART_MAP_MANUAL_MS=120000/);
 assert.match(source,/if\(now<manualMapUntil\)return/);
 assert.match(source,/nearCount=planes\.filter\(p=>!p\.signalLost&&ksuDistanceNm\(p\)<=50\)\.length/);
});
test('panel changes title based on fly relevance, and 25 NM banner stays separate',()=>{
 assert.match(source,/aircraft-panel-title/);
 assert.match(source,/Fly i området/);
 assert.match(source,/function withinKsuAlertArea\(p\)\{return !p\.signalLost&&ksuDistanceNm\(p\)<=25\}/);
});

test('idle long-distance view starts only briefly after one quiet minute',()=>{
 const c=ctx(),p=plane(56,{hex:'far'});
 assert.equal(c.idleAircraftGlimpse([p],1000),null);
 assert.equal(c.idleAircraftGlimpse([p],59000),null);
 const glimpse=c.idleAircraftGlimpse([p],61000);
 assert.equal(glimpse.key,'glimt:fly:far');
 assert.equal(glimpse.maxZoom,9);
 assert.equal(c.idleAircraftGlimpse([p],77000),null);
});
test('idle view does not select aircraft with stale signal or implausible distance',()=>{
 const c=ctx();
 assert.equal(c.idleAircraftGlimpse([plane(56,{signalLost:true})],1000),null);
 assert.equal(c.idleAircraftGlimpse([plane(125)],1000),null);
});
test('manual aircraft focus retains the two-minute pause',()=>{
 assert.match(source,/manualMapUntil=Date\.now\(\)\+SMART_MAP_MANUAL_MS/);
 assert.match(source,/function showSelectedAircraftOnMap\(\)/);
 assert.match(source,/Vis fly på kart/);
});
test('idle aircraft phase cannot override active KSU or AIS candidates',()=>{
 assert.match(source,/const glimpse=!best\?idleAircraftGlimpse\(list,now\):null/);
 assert.match(source,/let target=best\|\|glimpse/);
 assert.match(source,/if\(best\)idleGlimpseSince=null/);
});
