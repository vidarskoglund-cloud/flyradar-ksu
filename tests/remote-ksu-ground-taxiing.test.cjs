const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const start=app.indexOf('async function discoverKsuAircraftFromDeparture(f){');
const end=app.indexOf('async function discoverKsuDepartureAircraft(f){',start);
assert.ok(start>=0&&end>start);
const code=app.slice(start,end);
const deps=[
  'const checked=new Set();',
  'const airportByCode=code=>({code,lat:60.2934,lon:5.2181});',
  'const fetchJson=async()=>({ac:rows});',
  "const compactFlightId=x=>String(x||'').toUpperCase().replace(/[^A-Z0-9]/g,'');",
  'const remoteKsuOriginRouteKey=x=>x;',
  'const remoteKsuRouteChecked=checked;',
  'const remoteKsuCandidateRoute=async a=>{calls.push(a.flight);checked.add(a.flight);return routes[a.flight]||null;};',
  "const routeContainsAirport=(route,code)=>String(route?.airport_codes||'').split('-').includes(code);",
].join('\n');
const make=new Function('rows','routes',deps+'\nconst calls=[];'+code+'\nreturn {fn:discoverKsuAircraftFromDeparture,calls};');
test('taxiing on BGO with verified route is eligible despite a non-scheduled callsign',async()=>{
 const {fn,calls}=make([{flight:'WIF5DY',lat:60.2934,lon:5.2181,alt_baro:'ground',gs:8}],{WIF5DY:{airport_codes:'BGO-KSU'}});
 const found=await fn({airport:'BGO',flight_id:'WF570'});
 assert.equal(found?.flight,'WIF5DY');
 assert.equal(found?._matchedRoute?.airport_codes,'BGO-KSU');
 assert.deepEqual(calls,['WIF5DY']);
});
test('ground aircraft with a different destination is not linked to the KSU schedule',async()=>{
 const {fn}=make([{flight:'WIF5DY',lat:60.2934,lon:5.2181,alt_baro:'ground',gs:8}],{WIF5DY:{airport_codes:'BGO-TRD'}});
 assert.equal(await fn({airport:'BGO',flight_id:'WF570'}),null);
});
test('the third candidate is deferred by the two-call limit',async()=>{
 const rows=['WIF100','WIF200','WIF5DY'].map(flight=>({flight,lat:60.2934,lon:5.2181,alt_baro:'ground'}));
 const {fn,calls}=make(rows,{WIF5DY:{airport_codes:'BGO-KSU'}});
 assert.equal(await fn({airport:'BGO',flight_id:'WF570'}),null);
 assert.deepEqual(calls,['WIF100','WIF200']);
});
test('scan cadence remains 10 minutes pending live observation',()=>{
 assert.match(app,/setInterval\(loadAvinor,600000\)/);
 assert.match(app,/await updateRemoteKsuTracking\(\)/);
});
