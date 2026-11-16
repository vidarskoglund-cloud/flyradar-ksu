const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../app.js'),'utf8');
function section(start,end){return source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));}
function setup(){
  const context=vm.createContext({Math,Number,Date,Map,Set,rad:x=>x*Math.PI/180,recentPlaneCache:new Map(),aircraftRouteCache:new Map(),dist:()=>0});
  vm.runInContext(section('function isGroundOrTaxi','function nearestKnownAirport')+
    section('function getTrackDeg','function planeIcon')+
    section('function interpolatedPlanePosition','let lastMotionFrame')+
    section('function normalize','function getTrackDeg')+
    section('function planeKey','function ingestSharedTracks'),context);
  return context;
}
// The destination function ends at the next declaration.
const destinationStart=source.indexOf('function destinationPoint');
const destinationEnd=source.indexOf('\nfunction ',destinationStart+1);
function context(){const c=setup();vm.runInContext(source.slice(destinationStart,destinationEnd),c);return c;}
const plane={hex:'abc',lat:63.11,lon:7.82,gs:20,track:90,alt:'ground',positionAt:1000};
test('taxi motion advances between frames and has a short bounded horizon',()=>{
 const c=context();let prev=c.interpolatedPlanePosition(plane,1000);
 for(let time=1016;time<=4000;time+=16){const next=c.interpolatedPlanePosition(plane,time);assert(next[1]>prev[1]);assert(next[1]-prev[1]<0.00001);prev=next;}
 const end=c.interpolatedPlanePosition(plane,1000000);
 const limit=c.destinationPoint(plane.lat,plane.lon,20*5/3600,90);
 assert(Math.abs(end[1]-limit[1])<1e-9);
});
test('lost signal and stopped aircraft remain stationary',()=>{
 const c=context();for(const p of [{...plane,signalLost:true},{...plane,gs:0}]){
 assert.deepEqual(Array.from(c.interpolatedPlanePosition(p,60000)),[plane.lat,plane.lon]);}
});
test('a fresh fix preserves position and converges within three seconds',()=>{
 const c=context();const now=5000;const old={plane};const before=c.motionPosition(old,now);
 const fresh={...plane,lat:63.1105,lon:7.821,positionAt:now};const target=c.interpolatedPlanePosition(fresh,now);
 const entry={plane:fresh,offset:[before[0]-target[0],before[1]-target[1]],correctedAt:now};
 assert.deepEqual(Array.from(c.motionPosition(entry,now)),Array.from(before));
 assert.deepEqual(Array.from(c.motionPosition(entry,now+3000)),Array.from(c.interpolatedPlanePosition(fresh,now+3000)));
});
test('repeated cached coordinates do not restart prediction',()=>{
 const c=context();c.recentPlaneCache.set('abc',{plane});
 const normalized=c.normalize({hex:'abc',lat:plane.lat,lon:plane.lon,gs:20},{lat:63,lon:7});
 assert.equal(normalized.positionAt,1000);
});
test('render keeps markers, updates click data and removes filtered aircraft',()=>{
 const c=context();let creates=0;const removed=[];
 Object.assign(c,{list:[plane],motionMarkers:new Map(),layer:{removeLayer:m=>removed.push(m)},planeIcon:()=>({}),localRelevant:()=>true,observablePasserby:()=>false,fNm:()=>'',render:()=>{},select:p=>{c.clicked=p;},L:{marker:(pos)=>{creates++;return {pos,addTo(){return this},on(event,fn){this.click=fn;return this},setIcon(){},getTooltip(){return this.tooltip},setTooltipContent(t){this.tooltip=t},bindTooltip(t){this.tooltip=t;return this}};}}});
 const block=section('  const visibleKeys=new Set();','  const nearest=list[0]||null;');
 const render=()=>vm.runInContext('{'+block+'}',c);
 render();const original=c.motionMarkers.get('abc').marker;
 c.list=[{...plane,lat:63.1101}];render();assert.equal(creates,1);assert.equal(c.motionMarkers.get('abc').marker,original);
 original.click();assert.equal(c.clicked,c.list[0]);c.list=[];render();assert.equal(c.motionMarkers.size,0);assert.equal(removed.length,1);
});

test('selection highlight moves between existing markers without resetting motion',()=>{
 const c=context();const states={};c.ksuDistanceNm=()=>100;
 c.motionMarkers=new Map(['abc','def'].map(key=>[key,{marker:{getElement:()=>({classList:{toggle:(name,on)=>{if(name==='is-selected')states[key]=on}}}),setZIndexOffset:z=>{states[key+'Z']=z}}}]));
 vm.runInContext(section('function highlightSelectedAircraft','function select'),c);
 c.selected={hex:'abc'};c.highlightSelectedAircraft();assert.equal(states.abc,true);assert.equal(states.def,false);assert.equal(states.abcZ,1200);
 c.selected={hex:'def'};c.highlightSelectedAircraft();assert.equal(states.abc,false);assert.equal(states.def,true);assert.equal(states.abcZ,100);
});

test('proximity sounds once per boundary with hysteresis and no replay after missing signal',()=>{
 const c=vm.createContext({Map,Number,planeKey:p=>p.hex,ksuDistanceNm:p=>p.distance});
 vm.runInContext('const proximityState=new Map();let proximityReady=false;'+section('function proximityCrossings','function playProximityTone'),c);
 const update=(distance,signalLost=false)=>c.proximityCrossings([{hex:'abc',distance,signalLost}]).length;
 assert.equal(update(60),0);assert.equal(update(49),1);assert.equal(update(48),0);
 assert.equal(update(51),0);assert.equal(update(49),0);
 assert.equal(update(24),1);assert.equal(update(26),0);assert.equal(update(24),0);
 assert.equal(update(24,true),0);assert.equal(c.proximityCrossings([]).length,0);assert.equal(update(24),0);
 assert.equal(update(53),0);assert.equal(update(49),1);
});
test('initial aircraft within the area do not cause an arrival sound',()=>{
 const c=vm.createContext({Map,Number,planeKey:p=>p.hex,ksuDistanceNm:p=>p.distance});
 vm.runInContext('const proximityState=new Map();let proximityReady=false;'+section('function proximityCrossings','function playProximityTone'),c);
 assert.equal(c.proximityCrossings([{hex:'abc',distance:20}]).length,0);
 assert.equal(c.proximityCrossings([{hex:'abc',distance:20}]).length,0);
});

test('idle overview lasts only six seconds and returns to KSU close view',()=>{
 const c=vm.createContext({});vm.runInContext(section('function idleViewPlan','function hasMapTraffic'),c);
 assert.equal(c.idleViewPlan(0).radius,35);assert.equal(c.idleViewPlan(32000).radius,45);
 assert.equal(c.idleViewPlan(54000).radius,60);assert.equal(c.idleViewPlan(59000).radius,60);
 assert.equal(c.idleViewPlan(60000).radius,35);
});
test('distant unrelated and lost aircraft do not hold the map zoomed out',()=>{
 const c=vm.createContext({ksuDistanceNm:p=>p.distance,confirmedKsuArrival:p=>p.arrival===true});
 vm.runInContext(section('function hasMapTraffic','function focusIdleCandidate'),c);
 assert.equal(c.hasMapTraffic([]),false);
 assert.equal(c.hasMapTraffic([{distance:57}]),false);
 assert.equal(c.hasMapTraffic([{distance:20,signalLost:true}]),false);
 assert.equal(c.hasMapTraffic([{distance:25}]),true);
 assert.equal(c.hasMapTraffic([{distance:100,arrival:true}]),true);
});

test('schedule hides completed flights and uses revised time for delays',()=>{
 const c=vm.createContext({Date,Number,String});vm.runInContext(section('function scheduleDisplayTime','function renderAvinor'),c);
 const now=Date.parse('2026-11-16T17:27:00Z');
 const row={schedule_time:'2026-11-16T17:30:00Z'};
 assert.equal(c.upcomingSchedule({...row,status_code:'D'},now),false);
 assert.equal(c.upcomingSchedule({...row,status_code:'A'},now),false);
 assert.equal(c.upcomingSchedule(row,now),true);
 const delayed={schedule_time:'2026-11-16T15:00:00Z',status_code:'E',status_time:'2026-11-16T18:00:00Z'};
 assert.equal(c.upcomingSchedule(delayed,now),true);
 assert.equal(c.scheduleDisplayTime(delayed),Date.parse(delayed.status_time));
 assert.equal(c.upcomingSchedule({schedule_time:'2026-11-16T15:00:00Z'},now),false);
});

test('estimated status marks only later times as delayed',()=>{
 const c=vm.createContext({Date,Number,String});vm.runInContext(section('function avinorStatusText','function pointToSegmentNm'),c);
 const row={status_code:'E',schedule_time:'2026-11-16T18:00:00Z'};
 assert.equal(c.avinorStatusText({...row,status_time:'2026-11-16T18:05:00Z'}),'Forsinket');
 for(const status_time of ['2026-11-16T18:00:00Z','2026-11-16T17:55:00Z','', 'invalid'])assert.equal(c.avinorStatusText({...row,status_time}),'');
 assert.equal(c.avinorStatusText({...row,schedule_time:'',status_time:'2026-11-16T18:05:00Z'}),'');
 assert.equal(c.avinorStatusText({status_code:'A'}),'Landet');
 assert.equal(c.avinorStatusText({status_code:'D'}),'Avreist');
 assert.equal(c.avinorStatusText({status_code:'C'}),'Innstilt');
});
