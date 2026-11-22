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
   specialFlightCategory:()=>null,
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
test('manual map gestures retain the two-minute pause without a focus button',()=>{
 assert.match(source,/SMART_MAP_MANUAL_MS=120000/);
 assert.match(source,/map\.on\('dragstart',\(\)=>\{manualMapUntil=Date\.now\(\)\+120000/);
 assert.match(source,/if\(now<manualMapUntil\)return/);
 assert.match(source,/if\(!autoMapTransition\)\{manualMapUntil=Date\.now\(\)\+SMART_MAP_MANUAL_MS;updateMapFocusStatus\(\);\}/);
 assert.doesNotMatch(source,/Vis fly på kart/);
});
test('idle aircraft phase cannot override active KSU or AIS candidates',()=>{
 assert.match(source,/const glimpse=!best\?idleAircraftGlimpse\(list,now\):null/);
 assert.match(source,/let target=best\|\|glimpse/);
 assert.match(source,/if\(best\)idleGlimpseSince=null/);
});

test('automatic harbor selection requires vessel map priority and observed movement',()=>{
 assert.match(source,/const first=smartMapCandidate\(planes\)\[0\]/);
 assert.match(source,/first\?\.key\?\.startsWith\('bat:'\)/);
 assert.match(source,/function movingHarborVessel/);
 assert.match(source,/row\.observed<1/);
 assert.match(source,/speed<1\.5/);
});
test('manually selected vessel stays selected for two minutes',()=>{
 assert.match(source,/manualVesselSelectionUntil=Date\.now\(\)\+SMART_MAP_MANUAL_MS/);
 assert.match(source,/if\(now<manualVesselSelectionUntil\)return/);
});
test('vessel detail hold and aircraft priority remain intact',()=>{
 assert.match(source,/VESSEL_DETAIL_HOLD_MS=30000/);
 assert.match(source,/if\(selectedVesselTypeKey!==key && now-vesselFocusChangedAt<VESSEL_DETAIL_HOLD_MS\)return/);
 assert.match(source,/if\(selectedVesselTypeKey&&\(\(first&&!first\.key\.startsWith\('bat:'\)\)\|\|!vessels\.some/);
 assert.match(source,/function vesselMovementContext\(v\)/);
 assert.match(source,/updateVesselContext\(vessel\)/);
});

test('quiet regional glimpses favor flights directly near Molde airport',()=>{
 const c=ctx();
 const mol=plane(35,{hex:'mol',lat:62.748,lon:7.265});
 assert.equal(c.idleAircraftGlimpse([mol],1000),null);
 const glimpse=c.idleAircraftGlimpse([mol],61000);
 assert.equal(glimpse.secondary,'near-airport');
 assert.equal(glimpse.airportLabel,'Molde Årø');
 assert.deepEqual(Array.from(glimpse.points[0]),[62.7447,7.2625]);
 assert.equal(glimpse.maxZoom,11);
});
test('confirmed airborne KSU service from Bergen takes initial quiet-glimpse priority',()=>{
 const c=ctx();
 const flight=plane(130,{
  hex:'wif123',lat:61.0,lon:6.3,gs:230,alt:18000,
  remoteTracked:true,ksuFlight:{arr_dep:'A',airport:'BGO',flight_id:'WF576',status_code:''}
 });
 const mol=plane(35,{hex:'mol',lat:62.745,lon:7.26});
 assert.equal(c.idleAircraftGlimpse([flight,mol],1000),null);
 const first=c.idleAircraftGlimpse([flight,mol],61000);
 assert.equal(first.secondary,'ksu-inbound');
 assert.equal(first.key,'glimt:fly:wif123');
 const second=c.idleAircraftGlimpse([flight,mol],151000);
 assert.equal(second.secondary,'near-airport');
 assert.equal(second.airportLabel,'Molde Årø');
});
test('no unconfirmed Oslo/Bergen flights or taxiing aircraft promoted as KSU arrivals',()=>{
 const c=ctx(),flight=plane(130,{
  hex:'passerby',lat:60.5,lon:9.0,gs:250,alt:21000,
  ksuFlight:{arr_dep:'A',airport:'OSL',flight_id:'SK2309'}
 });
 c.idleAircraftGlimpse([flight],1000);
 const unverified=c.idleAircraftGlimpse([flight],61000);
 assert.notEqual(unverified?.secondary,'ksu-inbound');
 const taxi={...flight,hex:'taxi',remoteTracked:true,lat:60.195,lon:11.1,gs:20,alt:300};
 assert.equal(c.idleInboundKsu(taxi),false);
 assert.equal(c.idleInboundKsu({...flight,remoteTracked:true,ksuFlight:{...flight.ksuFlight,status_code:'C'}}),false);
});
test('regional focus is bounded, returns to KSU, and does not override selected aircraft',()=>{
 assert.match(source,/IDLE_NEARBY_AIRPORTS=\[/);
 assert.match(source,/const glimpse=!best\?idleAircraftGlimpse\(list,now\):null/);
 assert.match(source,/const glimpseTarget=Boolean\(target\?\.key\?\.startsWith\('glimt:'\)\)/);
 assert.match(source,/smartPlaneIdentity\(focused\)===target\.key\.slice\(6\)/);
 assert.match(source,/maxZoom:8,secondary:'ksu-inbound'/);
 assert.match(source,/if\(phase<IDLE_GLIMPSE_FROM_MS\|\|phase>=IDLE_GLIMPSE_TO_MS\)return null/);
});
