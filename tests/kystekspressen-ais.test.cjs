const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const worker=fs.readFileSync(path.join(__dirname,'../worker/src/index.js'),'utf8');
const start=worker.indexOf('const KYSTEKSPRESSEN_VESSELS =');
const end=worker.indexOf('function relevantPassengerVessel(v)',start);
assert.ok(start>=0&&end>start);
const ctx=vm.createContext({Date,Number,String,Object,Boolean});
vm.runInContext(worker.slice(start,end),ctx);
const identify=v=>vm.runInContext('kystekspressenIdentity('+JSON.stringify(v)+')',ctx);
const include=(v,now)=>vm.runInContext('includeVesselInRadar('+JSON.stringify(v)+','+now+')',ctx);
const now=Date.parse('2026-11-24T14:00:00Z');
const fresh=new Date(now-5*60*1000).toISOString(),stale=new Date(now-45*60*1000).toISOString();
test('known identity and route status are distinct from active service',()=>{
 assert.equal(identify({mmsi:'258416000'}).name,'EKSPRESSEN');
 assert.equal(identify({mmsi:'259604000'}).name,'FJORDPRINSESSEN');
 assert.equal(identify({mmsi:'257151900'}).status,'planned_dec_2026');
 assert.equal(identify({mmsi:'257781000'}).route,'800');
 assert.equal(identify({mmsi:'257605000'}).route,'805');
 assert.equal(identify({mmsi:'999999999',name:'EKSPRESSEN'}),null);
 assert.equal(identify({name:'EKSPRESSEN'}).name,'EKSPRESSEN');
 assert.equal(identify({name:'VINGTOR'}),null);
});
test('observed route-800 ships may remain at quay with fresh AIS and within 110 NM',()=>{
 for(const mmsi of ['258416000','259604000']){
  assert.equal(include({mmsi,speed:0,distanceNm:90,msgtime:fresh},now),true);
  assert.equal(include({mmsi,speed:0,distanceNm:90,msgtime:stale},now),false);
  assert.equal(include({mmsi,speed:0,distanceNm:90},now),false);
  assert.equal(include({mmsi,speed:0,distanceNm:111,msgtime:fresh},now),false);
  assert.equal(include({mmsi,speed:0,distanceNm:90,msgtime:new Date(now+10*60000).toISOString()},now),false);
 }
});
test('unverified, planned or ordinary stationary vessels never activate quay exception',()=>{
 for(const mmsi of ['257151900','257781000','257605000','999999999']){
  assert.equal(include({mmsi,speed:0,distanceNm:10,msgtime:fresh},now),false);
 }
 assert.equal(include({mmsi:'999999999',name:'EKSPRESSEN',speed:0,distanceNm:10,msgtime:fresh},now),false);
});
test('moving-vessel distance and category filtering remains unchanged',()=>{
 assert.equal(include({speed:8,distanceNm:12},now),true);
 assert.equal(include({speed:8,distanceNm:50},now),false);
 assert.equal(include({speed:8,distanceNm:105,category:'hurtigbat'},now),true);
 assert.equal(include({speed:8,distanceNm:112,category:'hurtigbat'},now),false);
});
test('AIS filtering uses one upstream retrieval with no additional polling',()=>{
 assert.equal((worker.match(/url\.pathname === "\/vessels"/g)||[]).length,1);
 assert.match(worker,/if \(includeVesselInRadar\(row\)\) vessels\.push\(row\)/);
 assert.doesNotMatch(worker.slice(start,end),/fetch\(|setInterval\(|setTimeout\(/);
});
