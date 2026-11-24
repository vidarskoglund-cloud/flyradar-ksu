const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../map/route-city-fallback.js'),'utf8');
const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const worker=fs.readFileSync(path.join(__dirname,'../worker/src/index.js'),'utf8');
const ctx=vm.createContext({Number,String,Array,Math,Set});
vm.runInContext(source,ctx);
const airport={city:'Helsinki',country_code:'FI'};
const payload={results:[{name:'Helsinki',country_code:'FI',latitude:60.1699,longitude:24.9384}]};
test('verified city may be used as approximate geographic context',()=>{
 const p=ctx.routeCityCandidate(airport,payload);
 assert.deepEqual(Array.from(p),[60.1699,24.9384]);
});
test('never silently geocode a similarly named city in another country',()=>{
 assert.equal(ctx.routeCityCandidate(airport,{results:[{name:'Helsinki',country_code:'US',latitude:40,longitude:-80}]}),null);
 assert.equal(ctx.routeCityCandidate({city:'Paris'},{results:[
  {name:'Paris',country_code:'FR',latitude:48.85,longitude:2.35},
  {name:'Paris',country_code:'US',latitude:33.66,longitude:-95.5}]}),null);
});
test('reject nonmatching, invalid, and unnamed places',()=>{
 assert.equal(ctx.routeCityCandidate({city:'Kristiansund'}, {results:[{name:'Kristiansand',latitude:58.1,longitude:8}]}),null);
 assert.equal(ctx.routeCityCandidate({city:'Helsinki'}, {results:[{name:'Helsinki',latitude:999,longitude:10}]}),null);
 assert.equal(ctx.routeCityCandidate({},payload),null);
});
test('airport position remains preferred; city estimates always visibly labelled',()=>{
 assert.match(app,/const exact=airportCoords\(airport\)/);
 assert.match(app,/if\(exact\)return \{point:exact,approximate:false/);
 assert.match(app,/Omtrentlig byområde:/);
 assert.match(app,/if\(!fromResult\|\|!toResult\)return/);
 assert.match(app,/overflightIntroPending\.add\(key\)/);
 assert.match(html,/route-city-fallback\.js\?v=1/);
 assert.ok(html.indexOf('route-city-fallback.js?v=1')<html.indexOf('app.js?v=223'));
 assert.match(worker,/country_code: ap\.country_code \|\| ap\.country_iso_code \|\| ""/);
});
test('geocoding is free, cacheable and respects map manual override',()=>{
 assert.match(app,/geocoding-api\.open-meteo\.com\/v1\/search/);
 assert.match(app,/overflightCityLookups\.set\(key,lookup\)/);
 assert.match(app,/Date\.now\(\)<manualMapUntil/);
 assert.match(worker,/FLIGHTAWARE_MONTHLY_BUDGET_USD = 4\.50/);
});
