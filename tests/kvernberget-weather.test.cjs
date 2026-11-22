const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const worker=fs.readFileSync(path.join(__dirname,'../worker/src/index.js'),'utf8');
const page=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const client=fs.readFileSync(path.join(__dirname,'../weather.js'),'utf8');
const a=worker.indexOf('const WEATHER_STATION='),b=worker.indexOf('export default {',a);
assert.ok(a>0&&b>a);
const c={Date,Number,Math,Array,String,JSON};
vm.runInNewContext(worker.slice(a,b)+';globalThis.out={weatherObservation,weatherForecast}',c);
const {weatherObservation,weatherForecast}=c.out;
test('Kvernberget METAR observations are measured, identified and converted from knots',()=>{
 const row={icaoId:'ENKB',obsTime:1763845200,temp:2,wspd:10,wgst:18,wdir:70,altim:30.12,visib:6,rawOb:'METAR ENKB'};
 const o=weatherObservation([row],1763845800000);
 assert.equal(o.station,'ENKB');
 assert.equal(o.temperature_c,2);
 assert.equal(o.wind_mps,5.1);
 assert.equal(o.gust_mps,9.3);
 assert.equal(o.wind_direction_deg,70);
 assert.equal(o.source,'Aviation Weather Center / METAR ENKB');
 assert.equal(o.raw,'METAR ENKB');
});
test('stale, missing and mismatched METARs never display as measured',()=>{
 const now=1763845800000;
 assert.equal(weatherObservation([{icaoId:'ENKB',obsTime:1763830000,temp:3}],now),null);
 assert.equal(weatherObservation([{icaoId:'ENBR',obsTime:1763845200,temp:3}],now),null);
 assert.equal(weatherObservation([],now),null);
});
test('MET forecast is explicitly modelled and geographically separate',()=>{
 const f=weatherForecast({properties:{timeseries:[{
 time:'2026-11-22T18:00:00Z',
 data:{instant:{details:{air_temperature:4,wind_speed:7,wind_speed_of_gust:10}},
 next_1_hours:{details:{precipitation_amount:0.5},summary:{symbol_code:'rain'}}}
 }]}});
 assert.equal(f.location,'Kristiansund sentrum');
 assert.equal(f.temperature_c,4);
 assert.equal(f.precipitation_next_hour_mm,0.5);
 assert.equal(f.source,'MET Norway Locationforecast');
});
test('weather runs on shared Worker cache and respects MET request rates',()=>{
 assert.match(worker,/url\.pathname==='\/weather'/);
 assert.match(worker,/WEATHER_CACHE_SECONDS=600/);
 assert.match(worker,/api\/data\/metar\?ids=ENKB&format=json/);
 assert.match(worker,/locationforecast\/2\.0\/compact\?lat=63\.1115&lon=7\.7600/);
 assert.match(worker,/caches\.default/);
 assert.match(worker,/WEATHER_USER_AGENT/);
 assert.match(client,/POLL_MS=10\*60\*1000/);
});
test('UI shows unavailable rather than silently using forecast as Kvernberget measurement',()=>{
 assert.match(client,/Målt på Kvernberget/);
 assert.match(client,/Modellberegnet/);
 assert.match(client,/Ingen fersk METAR/);
 assert.match(client,/observedFresh\(observation\)/);
 assert.match(page,/weather-side/);
 assert.match(page,/weather-regular/);
 assert.match(page,/weather\.js\?v=1/);
});
