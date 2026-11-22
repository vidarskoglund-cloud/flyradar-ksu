const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const worker=fs.readFileSync(path.join(__dirname,'../worker/src/index.js'),'utf8');
const admin=fs.readFileSync(path.join(__dirname,'../admin.html'),'utf8');
const pilot=code.slice(code.indexOf('const ROUTE25_PILOT_KEY='),code.indexOf('function mergeAircraft(',code.indexOf('const ROUTE25_PILOT_KEY=')));
function environment(){
 const values=new Map();
 const ctx=vm.createContext({
  Date,Math,Number,Set,Map,URL,JSON,String,
  localStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)},
  routeDay:()=> '2026-11-22',routeRequests:new Set(),routeAttempts:new Map(),
  flightRouteKey:p=>p.flight?'2026-11-22|'+p.flight:null,
  cachedAircraftRoute:()=>null,
  ksuDistanceNm:p=>p.distance,
  fetch:async()=>({ok:true,json:async()=>({route:{},source:null,diagnostics:{adsb_lol_attempted:true,flightaware_attempted:false}})}),
  AbortSignal:{timeout:()=>undefined},
  rememberAircraftRoute:()=>{},routeText:()=>'',route25PilotBusy:false,
  selected:null,render:()=>{},planeKey:p=>p.hex,
  console:{warn:()=>{}}
 });
 vm.runInContext(pilot+';globalThis.pilot={route25PilotStats,pilot25Candidate,runFreeRoutePilot25};',ctx);
 return ctx;
}
test('only fresh identified aircraft within 25 NM qualify',()=>{
 const c=environment(),stats=c.pilot.route25PilotStats();
 assert.equal(c.pilot.pilot25Candidate({flight:'WIF2U',distance:24,signalLost:false},stats),true);
 assert.equal(c.pilot.pilot25Candidate({flight:'WIF2U',distance:25.1},stats),false);
 assert.equal(c.pilot.pilot25Candidate({flight:'WIF2U',distance:12,signalLost:true},stats),false);
 assert.equal(c.pilot.pilot25Candidate({flight:'',distance:12},stats),false);
});
test('pilot uses strictly free Worker scope and never authorizes FlightAware',()=>{
 assert.match(pilot,/u\.searchParams\.set\('fa_scope','pilot25-free'\)/);
 assert.match(worker,/faScope === "zone25"/);
 assert.doesNotMatch(worker,/faScope === "pilot25-free"/);
 assert.match(pilot,/flightaware_attempted===true/);
 assert.match(pilot,/estimatedUsd:0/);
 assert.match(pilot,/paidCalls:0/);
});
test('daily route tests are unique, rate limited, and budget-capped to 120 free calls',()=>{
 assert.match(pilot,/ROUTE25_PILOT_LIMIT_PER_DAY=120/);
 assert.match(pilot,/ROUTE25_PILOT_GAP_MS=15000/);
 assert.match(pilot,/stats\.keys\.push\(key\)/);
 assert.match(pilot,/persistRoute25Pilot\(stats\); \/\/ reserve before request/);
});
test('pilot only makes one free request for a flight and records no route result',async()=>{
 const c=environment(),calls=[];
 c.fetch=async url=>{calls.push(String(url));return {ok:true,json:async()=>({route:null,source:null,diagnostics:{flightaware_attempted:false}})}};
 const p={flight:'WIF2U',hex:'a',distance:12,lat:63.1,lon:7.7,alt:20000};
 await c.pilot.runFreeRoutePilot25([p],Date.parse('2026-11-22T18:00:00Z'));
 const stats=c.pilot.route25PilotStats(Date.parse('2026-11-22T18:00:01Z'));
 assert.equal(stats.attempts,1);
 assert.equal(stats.noRoute,1);
 assert.equal(stats.paidCalls,0);
 assert.equal(stats.estimatedUsd,0);
 assert.equal(calls.length,1);
 assert.match(calls[0],/callsign=WIF2U/);
 assert.match(calls[0],/fa_scope=pilot25-free/);
 await c.pilot.runFreeRoutePilot25([p],Date.parse('2026-11-22T18:01:00Z'));
 assert.equal(calls.length,1);
});
test('actual paid fallback remains guarded by Cloudflare Durable Object $4.50 limit',()=>{
 assert.match(worker,/FLIGHTAWARE_MONTHLY_BUDGET_USD = 4\.50/);
 assert.match(worker,/state\.spent \+ cost > FLIGHTAWARE_MONTHLY_BUDGET_USD/);
 assert.match(worker,/if \(!actualUsage\) return null;/);
 assert.match(admin,/id="fa-actual"/);
 assert.match(admin,/route25-attempts/);
 assert.match(admin,/route25-cost/);
});
