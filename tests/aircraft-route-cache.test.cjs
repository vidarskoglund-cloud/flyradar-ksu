const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../aircraft/route-cache.js'),'utf8');
const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');

function setup(saved=[]){
 const entries=new Map([['flyradar-ksu-confirmed-routes-v1',JSON.stringify(saved)]]);
 const localStorage={getItem:key=>entries.get(key)||null,setItem:(key,value)=>entries.set(key,value)};
 const valid=(r)=>r?.airport_codes==='BGO-KSU'?'Bergen → Kristiansund':'Rute ikke tilgjengelig';
 const context=vm.createContext({Date,Math,Number,String,Map,Set,Array,JSON,localStorage,console,routeText:valid});
 vm.runInContext(source+'\n globalThis.cacheTest={routeCache,aircraftRouteCache,loadSavedRoutes,saveConfirmedRoute,flightRouteKey,routeDay,ROUTE_MAX_ENTRIES};',context);
 return {state:context.cacheTest,entries};
}
test('routes use day and callsign and preserve confirmed flight',()=>{
 const {state,entries}=setup();
 const p={flight:'WIF123'};
 const route={airport_codes:'BGO-KSU'};
 assert.equal(state.flightRouteKey(p),state.routeDay()+'|WIF123');
 state.saveConfirmedRoute(p,route);
 assert.equal(state.routeCache.get(state.flightRouteKey(p)).airport_codes,'BGO-KSU');
 const stored=JSON.parse(entries.get('flyradar-ksu-confirmed-routes-v1'));
 assert.equal(stored.length,1);
});
test('invalid routes are not stored',()=>{
 const {state,entries}=setup();
 state.saveConfirmedRoute({flight:'WIF123'},{airport_codes:'unknown'});
 assert.equal(state.routeCache.size,0);
 assert.equal(JSON.parse(entries.get('flyradar-ksu-confirmed-routes-v1')).length,0);
});
test('only current, valid routes are restored',()=>{
 const now=Date.now(),today=new Date(now).toISOString().slice(0,10);
 const saved=[
  {key:today+'|WIF001',savedAt:now-1000,route:{airport_codes:'BGO-KSU'}},
  {key:today+'|WIF002',savedAt:now-26*3600000,route:{airport_codes:'BGO-KSU'}},
  {key:today+'|WIF003',savedAt:now-1000,route:{airport_codes:'unknown'}},
  {key:'2001-01-01|WIF004',savedAt:now-1000,route:{airport_codes:'BGO-KSU'}}
 ];
 const {state}=setup(saved);
 state.loadSavedRoutes();
 assert.equal(state.routeCache.size,1);
 assert.equal(state.routeCache.get(today+'|WIF001').airport_codes,'BGO-KSU');
});
test('load order defers cache restore until app.js provides routeText',()=>{
 assert.ok(html.indexOf('aircraft/route-cache.js?v=1')>=0);
 assert.ok(html.indexOf('aircraft/route-cache.js?v=1')<html.indexOf('app.js?v=213'));
 assert.doesNotMatch(source,/^loadSavedRoutes\(\);\s*$/m);
 assert.match(app,/^loadSavedRoutes\(\);\s*$/m);
 assert.doesNotMatch(app,/function saveConfirmedRoute\s*\(/);
});
