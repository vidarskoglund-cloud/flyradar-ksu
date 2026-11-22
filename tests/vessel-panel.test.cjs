const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const photo=fs.readFileSync(path.join(__dirname,'../vessel-photos.js'),'utf8');
test('the vessel becomes the exclusive main panel, even in grid/fullscreen CSS',()=>{
 assert.match(html,/#cards\[hidden\]\{display:none!important\}/);
 assert.match(app,/\$\('cards'\)\)\$\('cards'\)\.hidden=true/);
 assert.match(app,/function vesselMovementContext\(v\)/);
});
test('vessel detail displays a primary name and compact speed and course',()=>{
 const a=app.indexOf('function vesselTypeCard('),b=app.indexOf('let lastTypeCardIdentity',a);
 const c={escapeVesselText:String,vesselKind:()=> 'Skip',typeIllustration:()=>'<svg></svg>',vesselMovementContext:()=>({detail:'AIS bevegelse ikke bekreftet'})};
 vm.runInNewContext(app.slice(a,b)+';globalThis.make=vesselTypeCard;',c);
 const card=c.make({name:'WATERLORD',mmsi:'257827000',imo:'7522150',speed:8.7,course:70,length:35,width:10,destination:'NOAES'});
 assert.match(card,/id="vessel-detail-name">WATERLORD/);
 assert.match(card,/data-vessel-speed>8\.7 knop/);
 assert.match(card,/data-vessel-course>70°/);
 assert.match(card,/IMO: 7522150/);
 assert.doesNotMatch(card,/WIF459/);
});
test('selected ship marker has a distinct highlight and refresh sync',()=>{
 assert.match(app,/vessel-marker\$\{vesselKey\(v\)===selectedVesselTypeKey/);
 assert.match(app,/function syncVesselSelectionMarkers/);
 assert.match(app,/el\.classList\.toggle\('selected',key===selectedVesselTypeKey\)/);
 assert.match(html,/\.vessel-marker\.selected/);
});
test('AIS updates preserve mounted image element instead of redrawing',()=>{
 assert.match(app,/if\(vessel&&identity===lastTypeCardIdentity\)/);
 assert.match(app,/el\.querySelector\('\[data-vessel-speed\]'\)/);
 assert.match(app,/lastTypeCardSignature=signature;\s*return/);
});
test('manual aircraft selection reveals the aircraft card and pauses auto boat selection',()=>{
 assert.match(app,/if\(lookupRoute\)\{\s*\/\/ An explicit aircraft click/);
 assert.match(app,/manualVesselSelectionUntil=Date\.now\(\)\+SMART_MAP_MANUAL_MS/);
 assert.match(app,/if\(\$\('cards'\)\)\$\('cards'\)\.hidden=false/);
});
test('ship photo uses fallback until loaded and explains no reliable match',()=>{
 assert.match(photo,/if\(!photo\)\{/);
 assert.match(photo,/Fant ikke et sikkert skipsfoto/);
 assert.match(photo,/img\.onload=\(\)=>/);
 assert.match(photo,/fallback\.hidden=true/);
 assert.match(photo,/kristiansund-vessel-photos-v3/);
});
