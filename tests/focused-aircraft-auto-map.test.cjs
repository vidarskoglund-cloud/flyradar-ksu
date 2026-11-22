const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const start=src.indexOf('function fitMap(list,s){');
const end=src.indexOf('// Brukerens zoom og panorering',start);
assert.ok(start>0&&end>start);
const code=src.slice(start,end);
function setup({offscreen=true,manual=false,lost=false}={}){
 const now=Date.now();
 const chosen={hex:'a1',lat:offscreen?64.5:63.11,lon:offscreen?10:7.8,signalLost:lost};
 const changes={extended:[],fit:[],fly:[]};
 class Bounds {
  constructor(points){this.points=points.map(p=>[Number(p[0]),Number(p[1])]);}
  contains(p){
   const lat=Number(p[0]),lon=Number(p[1]);
   const latitudes=this.points.map(x=>x[0]),longitudes=this.points.map(x=>x[1]);
   return lat>=Math.min(...latitudes)-0.001&&lat<=Math.max(...latitudes)+0.001&&
     lon>=Math.min(...longitudes)-0.001&&lon<=Math.max(...longitudes)+0.001;
  }
  extend(p){this.points.push(p);changes.extended.push(p);return this;}
 }
 const map={
  getBounds:()=>({pad:()=>({contains:p=>p[0]>63&&p[0]<63.2&&p[1]>7.6&&p[1]<8})}),
  getBoundsZoom:()=>8,getZoom:()=>11,
  once:()=>{},
  flyToBounds:(bounds,opts)=>changes.fly.push({bounds,opts}),
  fitBounds:(bounds,opts)=>changes.fit.push({bounds,opts})
 };
 const ctx=vm.createContext({
  Date,Number,Math,L:{latLngBounds:p=>new Bounds(p),point:(a,b)=>[a,b]},
  map,mapAreas:{city:{lat:63.11,lon:7.8}},
  planes:[chosen],selected:chosen,selectedVesselTypeKey:'',
  manualMapUntil:manual?now+60000:0,
  smartMapTarget:{key:'normal',rank:0},smartMapChangedAt:0,
  smartMapLastTrafficAt:0,smartMapLastMoveAt:0,
  smartMapCandidate:()=>[],idleAircraftGlimpse:()=>null,
  idleGlimpseSince:null,SMART_MAP_RETURN_DELAY_MS:15000,
  SMART_MAP_HOLD_MS:30000,SMART_MAP_MOVE_COOLDOWN_MS:15000,
  planeKey:p=>p.hex,areaBounds:()=>new Bounds([[63,7.6],[63.2,8]]),
  window:{matchMedia:()=>({matches:true})},autoMapTransition:false
 });
 vm.runInContext(code,ctx);
 return {ctx,chosen,changes};
}
test('an off-screen focused aircraft extends automatic framing to show its location',()=>{
 const {ctx,chosen,changes}=setup();
 ctx.fitMap([chosen],{});
 assert.equal(changes.extended.length,1);
 assert.equal(changes.extended[0][0],chosen.lat);
 assert.equal(changes.fit.length,1);
});
test('does not widen bounds for aircraft already on screen or without current signal',()=>{
 for(const options of [{offscreen:false},{lost:true}]){
  const {ctx,chosen,changes}=setup(options);
  ctx.fitMap([chosen],{});
  assert.equal(changes.extended.length,0);
 }
});
test('manual zoom or pan pauses automatic reframing for two minutes',()=>{
 const {ctx,chosen,changes}=setup({manual:true});
 ctx.fitMap([chosen],{});
 assert.equal(changes.extended.length,0);
 assert.equal(changes.fit.length+changes.fly.length,0);
});
test('map button and obsolete CSS are fully removed',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 assert.doesNotMatch(src,/show-aircraft-on-map/);
 assert.doesNotMatch(src,/updateShowAircraftOnMapButton/);
 assert.doesNotMatch(html,/show-aircraft-on-map/);
});
