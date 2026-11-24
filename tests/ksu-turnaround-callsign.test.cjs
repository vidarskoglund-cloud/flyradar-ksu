const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const start=app.indexOf('const VERIFIED_KSU_CALLSIGNS=');
const end=app.indexOf('function findKsuFlight(p){',start);
assert.ok(start>=0&&end>start);
const code=app.slice(start,end);
const scheduled=new Date().toISOString();
const departure={flight_id:'WF571',arr_dep:'D',airport:'BGO',schedule_time:scheduled};
const arrival={flight_id:'WF570',arr_dep:'A',airport:'BGO',schedule_time:scheduled};
const otherArrival={flight_id:'WF568',arr_dep:'A',airport:'BGO',schedule_time:scheduled};
function setup(distance=0.3){
 const ctx=vm.createContext({
  Date,String,Number,Array,
  compactFlightId:x=>String(x||'').toUpperCase().replace(/[^A-Z0-9]/g,''),
  ksuDistanceNm:()=>distance,
  plausibleKsuRouteCorridor:()=>true,
  avinorMatchPlausible:()=>true,
  confirmedRouteDestination:()=>null
 });
 vm.runInContext(code,ctx);
 return ctx.verifiedKsuCallsignMatch;
}
test('WIF5AD LN-WDI is identified as WF571 departure to BGO',()=>{
 const match=setup();
 assert.equal(match({flight:'WIF5AD',reg:'LN-WDI'},departure),true);
 assert.equal(match({flight:'WIF5AD',reg:'LN-WDI'},arrival),false);
 assert.equal(match({flight:'WIF5DY',reg:'LN-WDI'},departure),false);
});
test('reject another destination, wrong registration or unavailable schedule',()=>{
 const match=setup();
 assert.equal(match({flight:'WIF5AD',reg:'LN-WDI'},{...departure,airport:'OSL'}),false);
 assert.equal(match({flight:'WIF5AD',reg:'LN-OTHER'},departure),false);
 assert.equal(match({flight:'WIF5AD',reg:'LN-WDI'},{...departure,schedule_time:'2020-01-01T15:30:00Z'}),false);
 assert.equal(setup(55.1)({flight:'WIF5AD',reg:'LN-WDI'},departure),false);
});
test('do not override a contradictory confirmed BGO to KSU arrival route',()=>{
 const match=setup();
 assert.equal(match({flight:'WIF5AD',reg:'LN-WDI',routeData:{airport_codes:'BGO-KSU'}},departure),false);
 assert.equal(match({flight:'WIF5AD',reg:'LN-WDI',routeData:{airport_codes:'KSU-BGO'}},departure),true);
});
test('existing verified arrival WIF9VK remains supported',()=>{
 assert.equal(setup()({flight:'WIF9VK'},otherArrival),true);
});
test('old arrival is dropped on new known operational departure callsign',()=>{
 assert.match(app,/knownOperational&&!verifiedKsuCallsignMatch\(p,f\)/);
 assert.match(app,/p\.ksuFlight=p\.ksuFlight\|\|findKsuFlight\(p\)/);
 assert.ok(html.includes('app.js?v=221'));
});
