const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const worker=fs.readFileSync(path.join(__dirname,'../worker/src/index.js'),'utf8');
const start=app.indexOf('function isHighOverflight(p){'),end=app.indexOf('function routeLookupScope(p){',start);
assert.ok(start>=0&&end>start);
const ctx=vm.createContext({
 ksuDistanceNm:p=>p.d,
 confirmedKsuArrival:()=>false,
 specialService:()=>false,
 Number,Boolean
});
vm.runInContext(app.slice(start,end),ctx);
function f(overrides={}){return {flight:'FIN5TC',alt:39000,gs:431,d:21.2,ksuFlight:null,signalLost:false,...overrides};}
test('high fast non-local overflight is eligible',()=>{
 assert.equal(ctx.isHighOverflight(f()),true);
 for(const p of [f({alt:24000}),f({gs:290}),f({d:52}),f({ksuFlight:{airport:'KSU'}}),f({signalLost:true}),f({flight:''})]){
  assert.equal(ctx.isHighOverflight(p),false);
 }
});
test('overflight is prioritized for FlightAware, still hard-capped monthly',()=>{
 assert.match(worker,/const overflight = faScope === "overflight"/);
 assert.match(worker,/alt >= 25000/);
 assert.match(worker,/speed >= 300/);
 assert.ok(worker.indexOf('if (overflight) {')<worker.indexOf('adsbLolAttempted = true'));
 assert.match(worker,/FLIGHTAWARE_MONTHLY_BUDGET_USD = 4\.50/);
 assert.match(worker,/overflight-route-cache/);
 assert.match(worker,/flightAwareRoute\(env,callsign,true\)/);
});
test('confirmed overflight route is displayed once, holds briefly and returns locally',()=>{
 assert.match(app,/if\(!fromResult\|\|!toResult\)return/);
 assert.match(app,/overflightShown\.add\(key\)/);
 assert.match(app,/now<overflightIntroUntil/);
 assert.match(app,/OVERFLIGHT_ROUTE_HOLD_MS=12000/);
 assert.match(app,/overflightLocalReturnUntil=Date\.now\(\)\+25000/);
 assert.match(app,/areaBounds\(mapAreas\.city\.lat,mapAreas\.city\.lon,22\)/);
 assert.match(app,/higherPriorityOverflightTraffic\(planes\)/);
 assert.match(app,/if\(isHighOverflight\(shown\)&&shown\.routeData\)void showOverflightRouteIntro\(shown\)/);
 assert.match(app,/prefers-reduced-motion: reduce/);
 assert.match(app,/planeKey\(selected\)!==planeKey\(p\)/);
 assert.doesNotMatch(app,/p\.routeLookupSource!=="flightaware"/);
});
test('automatic paid lookup is scoped to the selected plane',()=>{
 assert.match(app,/const p=selected;\s*if\(!isHighOverflight\(p\)/);
 assert.match(app,/autoOverflightLookups\.has\(key\)/);
 assert.match(app,/queueOverflightRouteLookup\(\);/);
});
test('missing flight route retries after five minutes using free source',()=>{
 assert.match(app,/function queueMissedRouteRetry\(now=Date\.now\(\)\)/);
 assert.match(app,/now-last\.at<5\*60\*1000/);
 assert.match(app,/queueMissedRouteRetry\(\);/);
 assert.match(app,/const freeRetry=Boolean\(prior && prior\.scope!=='pilot25'\)/);
 assert.match(app,/if\(freeRetry\)u\.searchParams\.set\('free_only','1'\)/);
});
