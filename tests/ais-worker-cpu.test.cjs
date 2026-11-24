const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const src=fs.readFileSync(path.join(__dirname,'../worker/src/index.js'),'utf8');
const start=src.indexOf('if (url.pathname === "/vessels")');
const end=src.indexOf('if (url.pathname === "/route")',start);
assert.ok(start>=0&&end>start);
const handler=src.slice(start,end);
const prefixStart=src.indexOf('function distanceNm('),prefixEnd=src.indexOf('function relevantPassengerVessel(v)');
assert.ok(prefixStart>=0&&prefixEnd>prefixStart);
const prefix=src.slice(prefixStart,prefixEnd);
function makeHarness(data,{upstreamStatus=200,failCachePut=false}={}){
 const counts={fetch:0,cacheRead:0,cacheWrite:0};const memory=new Map();
 const cache={async match(key){counts.cacheRead++;return memory.get(key.url)?.clone()||null},
   async put(key,response){counts.cacheWrite++;if(failCachePut)throw Error('cache backend unavailable');memory.set(key.url,response.clone())}};
 const sandbox={Date,Number,String,Object,Array,Math,JSON,Boolean,Request,Response,AbortSignal,URL,Map,
  caches:{default:cache},setTimeout,Promise,console:{warn:()=>{}},
  corsHeaders:()=>({'Content-Type':'application/json; charset=utf-8'}),
  fetch:async()=>{counts.fetch++;return new Response(JSON.stringify(data),{status:upstreamStatus})}};
 vm.createContext(sandbox);
 vm.runInContext(prefix,sandbox);
 const fn=vm.runInContext('(async function(url,ctx){'+handler+'return new Response("unexpected",{status:500});})',sandbox);
 const tasks=[];
 return {counts,memory,async run(){
   const response=await fn(new URL('https://example.com/vessels'),{waitUntil:p=>tasks.push(p)});
   await Promise.allSettled(tasks.splice(0));
   return {status:response.status,json:await response.json()};
 }};
}
function rawVessel(name,mmsi,lat,lon,speed,shipType=40,extra={}){
 return {geometry:{type:'Point',coordinates:[lon,lat]},properties:{name,mmsi,speed,ship_type:shipType,...extra}};
}
const fresh=new Date().toISOString();
const fixtures={type:'FeatureCollection',features:[
 rawVessel('EKSPRESSEN','258416000',63.12,7.74,0,40,{msgtime:fresh}),
 rawVessel('FJORDPRINSESSEN','259604000',63.13,7.75,0,40,{msgtime:fresh}),
 rawVessel('FISHER','000000001',63.12,7.76,0,30),
 rawVessel('SPEEDBOAT','000000002',63.15,7.79,15,40),
 rawVessel('DISTANT','000000003',60.01,8.00,12,40),
 {type:'Feature',geometry:{type:'Point',coordinates:[null,null]},properties:{name:'BAD'}},
 rawVessel('VINGTOR','257151900',63.10,7.76,0,40,{msgtime:fresh})
]};
test('one pass retains known quay ferries and excludes unknown idle vessels',async()=>{
 const h=makeHarness(fixtures),r=await h.run();
 assert.equal(r.status,200);
 assert.equal(r.json.ok,true);
 assert.deepEqual(r.json.vessels.map(v=>v.mmsi).sort(),['000000002','258416000','259604000'].sort());
 assert.equal(r.json.diagnostic.upstream_rows,7);
 assert.equal(r.json.count,3);
 assert.equal(h.counts.fetch,1);
});
test('successful AIS response is reused between visits to same edge',async()=>{
 const h=makeHarness(fixtures);
 const a=await h.run(),b=await h.run();
 assert.equal(a.status,200);assert.equal(b.status,200);
 assert.equal(h.counts.fetch,1);
 assert.equal(h.counts.cacheWrite,1);
 assert.deepEqual(a.json.vessels,b.json.vessels);
});
test('upstream HTTP errors are not cached',async()=>{
 const h=makeHarness(fixtures,{upstreamStatus:500});
 const a=await h.run(),b=await h.run();
 assert.equal(a.status,502);
 assert.equal(b.status,502);
 assert.equal(h.counts.cacheWrite,0);
 assert.equal(h.counts.fetch,4); // existing retry once
});
test('cache write failure does not break a successful AIS response',async()=>{
 const h=makeHarness(fixtures,{failCachePut:true});
 const a=await h.run();
 assert.equal(a.status,200);
 assert.equal(a.json.vessels.length,3);
});
test('existing API schema, cache lifetime and Worker budgets are unchanged',()=>{
 assert.match(handler,/max-age=20, s-maxage=30/);
 assert.match(handler,/for \(const feature of rows\)/);
 assert.match(src,/FLIGHTAWARE_MONTHLY_BUDGET_USD = 4\.50/);
 assert.match(src,/if \(ctx\?\.waitUntil\)/);
 assert.equal((src.match(/url\.pathname === "\/vessels"/g)||[]).length,1);
});
