const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const admin=fs.readFileSync(path.join(__dirname,'../admin.html'),'utf8');
const worker=fs.readFileSync(path.join(__dirname,'../worker/src/index.js'),'utf8');
const section=app.slice(app.indexOf('function vesselMovementContext('),app.indexOf('function vesselTypeCard('));
function motion(v,history){
 const c=vm.createContext({Number,Date,dist:()=>v.distance,nm:x=>x,VESSEL_HARBOR_CENTER:[63.1115,7.76],VESSEL_HARBOR_CORE_NM:2.2,
  vesselKey:x=>String(x.mmsi),vesselMotionHistory:new Map(history||[])});
 vm.runInContext(section,c);
 return c.vesselMovementContext(v);
}
test('passing vessel not falsely described as bound for Kristiansund harbor',()=>{
 const v={mmsi:'257041670',name:'KRYSSHOLM',lat:63.12,lon:7.71,distance:3.4,speed:10.4,course:60,destination:'FISHFARMS'};
 const ctx=motion(v,[['257041670',{observed:1,at:Date.now(),trend:'ut'}]]);
 assert.match(ctx.title,/bort fra havneområdet/);
 assert.doesNotMatch(ctx.title,/anløp|til havn/);
});
test('incoming movement is described cautiously and does not imply harbor call',()=>{
 const v={mmsi:'257041670',lat:63.1,lon:7.6,distance:4.2,speed:10.4};
 const status=motion(v,[['257041670',{observed:1,at:Date.now(),trend:'inn'}]]);
 assert.match(status.title,/nærmer seg havneområdet/);
 assert.match(status.detail,/havneanløp ikke bekreftet/);
});
test('close, unknown and stale vessel observations stay neutral',()=>{
 let v={mmsi:'1',lat:63.1,lon:7.7,distance:2.0,speed:5};
 assert.equal(motion(v).title,'Fartøy i havneområdet');
 v.distance=4.0;
 assert.match(motion(v).title,/farvannet ved Kristiansund/);
 const stale=motion(v,[['1',{observed:1,at:Date.now()-180000,trend:'inn'}]]);
 assert.match(stale.title,/farvannet ved Kristiansund/);
});
test('manual and automatic ship selection use context and AIS destination label is factual',()=>{
 assert.match(app,/updateVesselContext\(vessel\)/);
 assert.match(app,/updateVesselContext\(v\)/);
 assert.match(app,/Oppgitt AIS-destinasjon/);
 assert.match(app,/id="vessel-motion-note"/);
 assert.doesNotMatch(app,/textContent='Fartøy ved Kristiansund havn'/);
});
test('admin copy separates free route pilot from other permitted paid route lookups',()=>{
 assert.match(admin,/25 NM-testen tillater ikke betalte FlightAware-oppslag/);
 assert.match(admin,/maksimalt 120 forsøk per UTC-dato/);
 assert.match(admin,/minst 15 sekunder mellom nye forsøk/);
 assert.match(admin,/aktiv[e]? Worker-versjonen må kontrolleres separat/);
 assert.match(worker,/FLIGHTAWARE_MONTHLY_BUDGET_USD = 4\.50/);
 assert.doesNotMatch(worker,/faScope === "pilot25-free"/);
});
