const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const worker=fs.readFileSync(path.join(__dirname,'../worker/src/index.js'),'utf8');
const client=fs.readFileSync(path.join(__dirname,'../norway.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../norge.html'),'utf8');
const main=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const begin=worker.indexOf('const NORWAY_INTERVAL_MS=');
const end=worker.indexOf('export class TrackStore',begin);
assert.ok(begin>=0&&end>begin);
const sandbox=vm.createContext({Number,String,Array,Math});
vm.runInContext(worker.slice(begin,end)+';globalThis.norway={NORWAY_AREAS,NORWAY_INTERVAL_MS,NORWAY_MAX_CALLS_DAY,norwayPosition};',sandbox);
const {NORWAY_AREAS,NORWAY_INTERVAL_MS,NORWAY_MAX_CALLS_DAY,norwayPosition}=sandbox.norway;
function nm(a,b){
 const r=n=>n*Math.PI/180,dl=r(a.lat-b.lat),dn=r(a.lon-b.lon);
 const h=Math.sin(dl/2)**2+Math.cos(r(a.lat))*Math.cos(r(b.lat))*Math.sin(dn/2)**2;
 return 3440.065*2*Math.asin(Math.sqrt(h));
}
test('all six public Norway scans comply with <=250 NM and cover BGO/OSL',()=>{
 assert.equal(NORWAY_AREAS.length,6);
 for(const a of NORWAY_AREAS)assert.ok(a.r<=250);
 for(const airport of [
  {name:'Bergen Flesland',lat:60.2934,lon:5.2181},
  {name:'Oslo Gardermoen',lat:60.1939,lon:11.1004},
  {name:'Kristiansand',lat:58.2042,lon:8.0854},
  {name:'Stavanger',lat:58.8768,lon:5.6379},
  {name:'Bodø',lat:67.2692,lon:14.3653},
  {name:'Tromsø',lat:69.6833,lon:18.9189},
  {name:'Alta',lat:69.9761,lon:23.3717},
  {name:'Kirkenes',lat:69.7258,lon:29.8913}
 ]){
  assert.ok(NORWAY_AREAS.some(a=>nm(a,airport)<=a.r),'missing '+airport.name);
 }
});
test('provider calls are cached, shared, sequential and capped',()=>{
 assert.equal(NORWAY_INTERVAL_MS,600000);
 assert.equal(NORWAY_MAX_CALLS_DAY,900);
 assert.match(worker,/url.pathname==='\/norway-shared'/);
 assert.match(worker,/this\.norwayFetchPromise=/);
 assert.match(worker,/storage\.put\('norwayQuota',quota\)/);
 assert.match(worker,/await this\.reserveAdsbSlot\(\)/);
 assert.match(worker,/this\.adsbNextSlotAt=Date\.now\(\)\+1500/);
 assert.match(worker,/response\.status===429\?30:15/);
 assert.match(worker,/url.pathname==='\/norway-aircraft'/);
 assert.doesNotMatch(client,/opendata\.adsb\.fi\/api/);
 assert.match(client,/const REFRESH_MS=10\*60\*1000/);
});
test('position limits, deduplication and simple output protect the Norway map',()=>{
 assert.equal(norwayPosition({lat:null,lon:8}),null);
 assert.equal(norwayPosition({lat:60,lon:11,seen_pos:120}),null);
 const p=norwayPosition({hex:'abc123',lat:60.2,lon:11.1,flight:'SAS100',gs:250,random:'secret'});
 assert.equal(p.flight,'SAS100');
 assert.equal(p.random,undefined);
 assert.match(worker,/merged\.set\(key,a\)/);
 assert.match(worker,/ac:\[\.\.\.merged\.values\(\)\]\.slice\(0,2200\)/);
});
test('separate Norway page keeps the KSU radar unaffected',()=>{
 assert.match(html,/id="norway-map"/);
 assert.match(html,/adsb\.fi/);
 assert.match(main,/href="norge\.html"/);
 assert.match(html,/norway\.js\?v=1/);
 assert.match(client,/bindPopup\(aircraftPopup\(a\)\)/);
 assert.match(client,/markers\.clearLayers\(\)/);
 assert.match(client,/data\.stale/);
 assert.match(client,/data\.partial/);
 assert.match(client,/map\.fitBounds/);
});
