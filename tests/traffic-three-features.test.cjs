const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const road=fs.readFileSync(path.join(__dirname,'../road-status.js'),'utf8');
function vesselWorld(){
 const marker={at:{lat:63.1,lng:7.7},
  setLatLng(p){this.at={lat:p[0],lng:p[1]};},
  getLatLng(){return this.at;},
  getElement(){return {querySelector:()=>({style:{}})}}
 };
 const markers=new Map([['123',marker]]);
 const c=vm.createContext({
  Map,Number,Math,Date,
  vesselMarkers:markers,vesselAnimation:new Map(),
  nm:x=>x,dist:(a,b,c,d)=>Math.hypot(a-c,b-d),
  vesselKey:v=>v.mmsi
 });
 const first=app.indexOf('function vesselMotionFrame(');
 const end=app.indexOf('const VESSEL_HARBOR_CENTER=',first);
 assert.ok(first>0&&end>first);
 vm.runInContext('const VESSEL_TWEEN_MS=24000;'+app.slice(first,end),c);
 return {c,marker};
}
test('AIS vessel markers animate smoothly to actual received fix without overshooting',()=>{
 const {c,marker}=vesselWorld();
 c.scheduleVesselMotion(marker,'123',{lat:63.12,lon:7.72,heading:90,speed:8},1000);
 assert.equal(c.vesselAnimation.size,1);
 c.vesselMotionFrame(13000);
 assert.ok(marker.at.lat>63.1&&marker.at.lat<63.12);
 c.vesselMotionFrame(50000);
 assert.equal(marker.at.lat,63.12);
 assert.equal(marker.at.lng,7.72);
 assert.equal(c.vesselAnimation.size,0);
});
test('unchanged AIS fixes and implausible position jumps are not extrapolated',()=>{
 const {c,marker}=vesselWorld();
 c.scheduleVesselMotion(marker,'123',{lat:63.1,lon:7.7,speed:8},1000);
 assert.equal(c.vesselAnimation.size,0);
 c.scheduleVesselMotion(marker,'123',{lat:65.5,lon:10,speed:8},1000);
 assert.equal(c.vesselAnimation.size,0);
 assert.equal(marker.at.lat,65.5);
});
test('realtime ship rendering retains markers and 30-second polling',()=>{
 assert.match(app,/let marker=vesselMarkers\.get\(key\)/);
 assert.match(app,/scheduleVesselMotion\(marker,key,v\)/);
 assert.match(app,/vesselLayer\.removeLayer\(marker\)/);
 assert.doesNotMatch(app,/function renderVessels\(\)\{\s*vesselLayer\.clearLayers\(\)/);
 assert.match(app,/setInterval\(loadVessels,30000\)/);
 assert.match(app,/vesselMotionFrame\(now\)/);
});
test('roads show unknown rather than false open or closed without DATEX registration',()=>{
 assert.match(road,/DATEX II v3\.1 requires registration/);
 assert.match(road,/Freifjordtunnelen/);
 assert.match(road,/Atlanterhavstunnelen/);
 assert.match(road,/Nordsundbrua/);
 assert.match(road,/Omsundbrua/);
 assert.match(road,/Ikke kontrollert/);
 assert.doesNotMatch(road,/status\.textContent='Åpen'/);
 assert.match(html,/id="road-status-side"/);
 assert.match(html,/id="road-status"/);
 assert.match(html,/https:\/\/www\.vegvesen\.no\/trafikk\//);
});
test('free route pilot retains paid fallback block while presenting lookup outcome',()=>{
 assert.match(app,/fa_scope','pilot25-free'/);
 assert.match(app,/function pilot25LookupStatus\(p\)/);
 assert.match(app,/stats\.results\[key\]=route\?'found':'not-found'/);
 assert.match(app,/stats\.results\[key\]='error'/);
 assert.match(app,/Gratis rutekontroll utført · ingen bekreftet rute/);
 assert.match(app,/ROUTE25_PILOT_LIMIT_PER_DAY=120/);
 assert.match(html,/route-pilot-note/);
});
