const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const begin=src.indexOf('function mapFocusStatusText(');
const end=src.indexOf('function smartPlaneIdentity(',begin);
assert.ok(begin>=0&&end>begin);
const code=src.slice(begin,end);
function setup({target=null,manual=false,plane=null,vessel=null,source='direct'}={}){
 const header={textContent:'',className:''},fullscreen={textContent:''};
 const now=Date.parse('2026-11-22T19:00:00Z');
 const body={dataset:{liveSource:source}};
 const ctx=vm.createContext({
  Date,Number,String,smartMapTarget:target,
  manualMapUntil:manual?now+60000:0,
  planes:plane?[plane]:[],
  vessels:vessel?[vessel]:[],
  smartPlaneIdentity:p=>'fly:'+(p.hex||p.flight||p.reg),
  vesselKey:v=>String(v.mmsi),
  document:{body},
  $:id=>id==='status'?header:id==='fs-status'?fullscreen:null
 });
 vm.runInContext(code,ctx);
 return {ctx,now,header,fullscreen};
}
test('ship focus header tracks actual AIS vessel even if a stale flight is selected',()=>{
 const v={mmsi:'259883000',name:'HOPSFJORD',lat:63.12,lon:7.7};
 const t=setup({target:{key:'bat:259883000'},vessel:v,
  plane:{hex:'a1',flight:'SAS1326',signalLost:false}});
 assert.equal(t.ctx.mapFocusStatusText(t.now),'Følger fartøy HOPSFJORD');
 t.ctx.updateMapFocusStatus(t.now);
 assert.match(t.header.textContent,/^Følger fartøy HOPSFJORD · /);
 assert.doesNotMatch(t.header.textContent,/SAS1326|fly innen 50 NM/);
 assert.equal(t.fullscreen.textContent,t.header.textContent);
});
test('aircraft target uses current live flight number and not old selection',()=>{
 const p={hex:'a1',flight:'SAS4434',signalLost:false};
 const t=setup({target:{key:'fly:a1'},plane:p});
 assert.equal(t.ctx.mapFocusStatusText(t.now),'Følger fly SAS4434');
});
test('idle glimpses do not pretend to follow; no target produces overview',()=>{
 const p={hex:'a1',flight:'WIF77',signalLost:false};
 assert.equal(setup({target:{key:'glimt:fly:a1'},plane:p}).ctx.mapFocusStatusText(Date.now()),'Viser fly WIF77');
 assert.equal(setup().ctx.mapFocusStatusText(Date.now()),'Oversikt Kristiansund');
 assert.equal(setup({target:{key:'bat:removed'}}).ctx.mapFocusStatusText(Date.now()),'Oversikt Kristiansund');
});
test('manual navigation and stale sources cannot misleadingly claim automatic focus',()=>{
 const t=setup({target:{key:'fly:a1'},plane:{hex:'a1',flight:'SAS1326'},manual:true});
 assert.equal(t.ctx.mapFocusStatusText(t.now),'Kartvisning valgt manuelt');
 t.ctx.updateMapFocusStatus(t.now);
 assert.match(t.header.textContent,/Kartvisning valgt manuelt/);
 const stale=setup({target:{key:'fly:a1'},plane:{hex:'a1',flight:'SAS1326'},source:'stale'});
 stale.header.textContent='Flydata · viser sist kjente data';
 stale.ctx.updateMapFocusStatus(stale.now);
 assert.equal(stale.header.textContent,'Flydata · viser sist kjente data');
});
test('real source code updates status after the map picks a focus, not from arbitrary selected flights',()=>{
 assert.match(src,/if\(autoFit\) fitMap\(list,s\);\s*updateMapFocusStatus\(\)/);
 assert.doesNotMatch(src,/\$\('status'\)\.textContent=`\$\{localCountNow\} fly innen 50 NM/);
 assert.doesNotMatch(src,/const followText=followed\?/);
 assert.match(src,/map\.on\('dragstart',[^\n]*updateMapFocusStatus\(\)/);
});
