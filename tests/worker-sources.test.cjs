const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const code=fs.readFileSync('worker/src/index.js','utf8');
const context=vm.createContext({Date,Map,Set,Number,AbortSignal,console:{warn(){}},Response});
vm.runInContext(code.slice(code.indexOf('function keyFor'),code.indexOf('export class TrackStore'))+code.slice(code.indexOf('async function getSource'),code.indexOf('export default')),context);
const now=Date.now();
const ac=(overrides={})=>({hex:'abc123',lat:63,lon:8,seen_pos:2,track:90,...overrides});
const src=(name,a,t=now)=>({name,now:t,receivedAt:now,ac:[a]});
test('newest position wins regardless of source order',()=>{
 for(const sources of [[src('old',ac({seen_pos:20})),src('new',ac({lat:64}))],[src('new',ac({lat:64})),src('old',ac({seen_pos:20}))]]){
 const [a]=context.mergeAircraft(...sources); assert.equal(a.lat,64);assert.equal(a._position_source,'new');}
});
test('source timestamp compensates old response and supports seconds',()=>{
 const [a]=context.mergeAircraft(src('cached',ac({seen_pos:0}),now-30000),src('fresh',ac({lat:64}),now/1000));assert.equal(a.lat,64);
});
test('invalid or stale coordinates never override valid position',()=>{
 for(const bad of [{lat:null},{lon:181},{seen_pos:null},{seen_pos:-1},{seen_pos:121},{lat:'63'},{seen_pos:undefined}]){
 const out=context.mergeAircraft(src('bad',ac(bad)),src('good',ac()));assert.equal(out.length,1);assert.equal(out[0]._position_source,'good');}
});
test('motion fields remain coherent while static identity can be filled',()=>{
 const old=ac({seen_pos:20,flight:'WIF123',gs:300});const fresh=ac({lat:64}); delete fresh.track;
 const [a]=context.mergeAircraft(src('old',old),src('fresh',fresh));assert.equal(a.flight,'WIF123');assert.equal(a.track,undefined);assert.equal(a.gs,undefined);
});
test('cache ages positions and expires old fixes',()=>{
 const snap={ac:context.mergeAircraft(src('a',ac()))};assert.ok(context.ageSnapshot(snap,now+10000).ac[0].seen_pos>=12);assert.equal(context.ageSnapshot(snap,now+130000).ac.length,0);
});
test('source responses and failure diagnostics',async()=>{
 for(const key of ['ac','aircraft']){context.fetch=async()=>new Response(JSON.stringify({[key]:[],now}));assert.equal((await context.getSource('test','https://example.com')).ok,true);}
 context.fetch=async()=>new Response('{}');assert.equal((await context.getSource('test','https://example.com')).error,'invalid_response_schema');
 context.fetch=async()=>new Response('denied',{status:403,headers:{'cf-ray':'test-ray'}});const denied=await context.getSource('test','https://example.com');assert.equal(denied.error,'access_denied');assert.ok(denied.retry_at>=now+300000);assert.equal(denied.cf_ray,'test-ray');
 context.fetch=async()=>new Response('',{status:429,headers:{'retry-after':'600'}});assert.ok((await context.getSource('test','https://example.com')).retry_at>=now+600000);
 context.fetch=async()=>{throw new DOMException('timed out','TimeoutError')};assert.equal((await context.getSource('test','https://example.com')).error,'timeout');
});
test('Durable Object caches shared calls, backs off 403, and public endpoint stays compatible',async()=>{
 const data=new Map();let calls=0;
 const ctx={storage:{get:async k=>data.get(k),put:async(k,v)=>data.set(k,v)}};
 const c=vm.createContext({Date,Map,Set,Number,URL,Response,Request,AbortSignal,console:{warn(){}},DurableObject:class{constructor(ctx){this.ctx=ctx;}},fetch:async url=>{
 calls++;
 if(url.includes('airplanes'))return new Response('',{status:403});
 return new Response(JSON.stringify({now:Date.now(),ac:[ac({seen_pos:1})]}));
 }});
 const executable=code.replace(/^import .*;\n/gm,'').replace('export class TrackStore','class TrackStore').replace('export default {','const handler = {');
 vm.runInContext(executable+'\nthis.Store=TrackStore;this.handler=handler;',c);
 const instance=new c.Store(ctx,{});
 const stub={fetch:(url,init)=>instance.fetch(new Request(url,init))};
 const env={TRACK_STORE:{idFromName:()=> 'ksu',get:()=>stub}};
 let response=await c.handler.fetch(new Request('https://worker/aircraft'),env);let result=await response.json();
 assert.equal(response.status,200);assert.equal(result.count,1);assert.equal(result.sources['airplanes.live'].error,'access_denied');assert.equal(calls,3);assert.ok(result.tracks.abc123);
 await c.handler.fetch(new Request('https://worker/aircraft'),env);assert.equal(calls,3);
 data.get('aircraftSharedSnapshot').generated_at_ms-=20000;
 await c.handler.fetch(new Request('https://worker/aircraft'),env);assert.equal(calls,5);
 assert.equal((await c.handler.fetch(new Request('https://worker/health'),env)).status,200);
});
