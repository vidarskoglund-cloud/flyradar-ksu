const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','offshore-coverage.js'),'utf8');
function harness(){
 const memory=new Map();
 const window={dispatchEvent(){}};
 const localStorage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)};
 const api=Function('window','localStorage','Event',source+';return window.KsuOffshoreCoverage;')(window,localStorage,class Event{});
 return {api,memory};
}
const plane=(flight,lat,lon,t)=>({hex:'478057',reg:'LN-OQU',flight,type:'S92',lat,lon,alt:2400,positionAt:t});
test('outbound and return callsigns remain in one ICAO helicopter trip',()=>{
 const {api}=harness(),now=Date.now();
 api.observe([plane('HKS100',63.112,7.824,now)],now);
 api.observe([plane('HKS100',63.5,6.5,now+100000)],now+100000);
 api.observe([plane('HKS417',63.6,6.2,now+400000)],now+400000);
 const trips=api.snapshot();
 assert.equal(trips.length,1);
 assert.deepEqual(trips[0].callsigns,['HKS100','HKS417']);
 assert.equal(trips[0].gaps.length,2);
 assert.equal(trips[0].points.length,3);
 assert.ok(trips[0].maxNm>25);
});
test('a distant helicopter is not misclassified as departing from KSU',()=>{
 const {api}=harness();const now=Date.now();
 api.observe([plane('HKS200',65,4,now)],now);
 assert.equal(api.snapshot().length,0);
});
test('no synthetic track fixes are generated across signal gaps',()=>{
 const {api}=harness(),now=Date.now();
 api.observe([plane('HKS1',63.112,7.824,now)],now);
 api.observe([plane('HKS2',63.8,6,now+600000)],now+600000);
 const trip=api.snapshot()[0];
 assert.equal(trip.points.length,2);
 assert.equal(trip.gaps.length,1);
 assert.equal(trip.gaps[0].minutes,10);
});
test('script does not send data to third-party services',()=>{
 assert.doesNotMatch(source,/\bfetch\s*\(/);
 assert.doesNotMatch(source,/\bXMLHttpRequest\b/);
});
