/* Offline/local offshore helicopter coverage recorder.
   Identity is ICAO HEX (not callsign). Does not fabricate positions in signal gaps.
   Records only while this web page is running; no server-side collection yet. */
(function(){
'use strict';
const KEY='trafikkradar-offshore-trips-v1',VERSION=1;
const KSU={lat:63.1118,lon:7.8245},MAX_TRIPS=80,MAX_POINTS=2500;
const START_NM=25,MAX_GAP_MS=90*1000,MAX_TRIP_MS=16*3600*1000,QUIET_END_MS=6*3600*1000;
const msHour=3600*1000;
let trips=read();
function read(){
 try{const s=JSON.parse(localStorage.getItem(KEY)||'[]');
  return Array.isArray(s)?s.filter(x=>x&&typeof x.hex==='string'&&Array.isArray(x.points)).slice(-MAX_TRIPS):[];
 }catch{return []}
}
function store(){
 try{localStorage.setItem(KEY,JSON.stringify(trips.slice(-MAX_TRIPS)));}catch(e){console.warn('Offshorehistorikk kunne ikke lagres',e)}
}
function nmDistance(a,b,c,d){
 const rad=Math.PI/180;
 const s1=Math.sin((c-a)*rad/2)**2+Math.cos(a*rad)*Math.cos(c*rad)*Math.sin((d-b)*rad/2)**2;
 return 3440.065*2*Math.atan2(Math.sqrt(s1),Math.sqrt(Math.max(0,1-s1)));
}
function ident(p){
 const hex=String(p?.hex||'').trim().toLowerCase();
 return /^[0-9a-f]{6}$/.test(hex)?hex:null;
}
function helicopter(p){
 const type=String(p?.type||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
 const desc=String(p?.desc||'').toLowerCase();
 const known=['S92','S76','EC35','EC45','EC55','EC75','EC20','EC25','EC30','EC50','EC15','EC65','AS32','AS35','AS50','AS55','AS65','H145','H135','H125','H160','H175','AW09','AW10','AW11','AW13','AW16','AW18','A109','A119','A139','A169','A189','B06','B206','B212','B222','B407','B412','B429','B505','R22','R44','R66','MD52','MD60','MD90','NH90','MI8','MI17','MI24','MI26','UH60','H60','H47','CH47','H500','H369','H269','CABR','G2CA'];
 return known.includes(type)||/helicopter|helikopter|rotorcraft/.test(desc);
}
function freshPosition(p,now){
 const t=Number(p.positionAt);
 return !p.signalLost&&Number.isFinite(t)&&Math.abs(now-t)<2*60*1000;
}
function start(hex,p,now,d){
 return {id:hex+'-'+now,hex,reg:String(p.reg||'').slice(0,16),callsigns:[],
  startedAt:now,lastAt:now,maxNm:d,lastFix:null,points:[],gaps:[],
  status:'aktiv',reachedOffshore:false,returnObserved:false,
  note:'Startet innen 25 NM av KSU; avgang/landing ikke bekreftet'};
}
function append(trip,p,now,d){
 const callsign=String(p.flight||'').trim().toUpperCase().slice(0,24);
 if(callsign&&!trip.callsigns.includes(callsign))trip.callsigns.push(callsign);
 const fix={lat:Number(p.lat),lon:Number(p.lon),t:now,nm:+d.toFixed(2),
  alt:Number.isFinite(Number(p.alt))?Number(p.alt):null,call:callsign};
 const last=trip.lastFix;
 if(last&&now-last.t>=MAX_GAP_MS&&!(trip.gaps||[]).some(g=>g.end===now)){
  trip.gaps.push({start:last.t,end:now,from:{lat:last.lat,lon:last.lon,nm:last.nm},
   to:{lat:fix.lat,lon:fix.lon,nm:fix.nm},minutes:+((now-last.t)/60000).toFixed(1)});
 }
 const shouldSave=!last||nmDistance(last.lat,last.lon,fix.lat,fix.lon)>.10||now-last.t>=30000;
 if(shouldSave)trip.points.push(fix);
 if(trip.points.length>MAX_POINTS)trip.points=trip.points.filter((_,i)=>i%2===0).slice(-MAX_POINTS);
 if(d>trip.maxNm)trip.maxNm=+d.toFixed(2);
 if(d>=25)trip.reachedOffshore=true;
 if(trip.reachedOffshore&&d<=10)trip.returnObserved=true;
 trip.lastFix=fix;trip.lastAt=now;
 if(trip.returnObserved&&d<=2&&Number(p.alt)>=0&&Number(p.alt)<1500){
  trip.status='nær KSU igjen (landing ikke bekreftet)';
 }
}
function observe(list,now=Date.now()){
 if(!Array.isArray(list))return;
 let changed=false;
 for(const trip of trips){
  if(trip.status==='aktiv'&&now-trip.lastAt>QUIET_END_MS){
   trip.status='avsluttet uten bekreftet landing';changed=true;
  }
 }
 for(const p of list){
  const hex=ident(p);
  if(!hex||!helicopter(p)||!freshPosition(p,now)||
     p.lat==null||p.lon==null||!Number.isFinite(Number(p.lat))||!Number.isFinite(Number(p.lon)))continue;
  const d=nmDistance(KSU.lat,KSU.lon,Number(p.lat),Number(p.lon));
  let t=[...trips].reverse().find(x=>x.hex===hex&&
   (x.status==='aktiv'||x.status.startsWith('nær KSU'))&&
   now-x.startedAt<MAX_TRIP_MS&&now-x.lastAt<QUIET_END_MS);
  if(!t){
   // Only initiate a flight when actually observed near KSU. A remote helicopter
   // seen far away cannot be classified as departing from KSU.
   if(d>START_NM)continue;
   t=start(hex,p,now,d);trips.push(t);
  }
  // A new distinct trip begins only on later near-airport observation,
  // not when the callsign changes during the same trip.
  if(t.status.startsWith('nær KSU')&&now-t.lastAt>90*60000&&d<=START_NM){
   t.status='avsluttet ved KSU-området';
   t=start(hex,p,now,d);trips.push(t);
  }
  if(t.lastFix&&now-t.lastFix.t<12000&&
   nmDistance(t.lastFix.lat,t.lastFix.lon,Number(p.lat),Number(p.lon))<.10){
   const call=String(p.flight||'').trim().toUpperCase().slice(0,24);
   if(call&&!t.callsigns.includes(call)){t.callsigns.push(call);changed=true}
   continue;
  }
  append(t,p,now,d);changed=true;
 }
 if(changed){trips=trips.slice(-MAX_TRIPS);store();window.dispatchEvent(new Event('offshore-trips-updated'));}
}
function snapshot(){return trips.map(x=>({...x,points:x.points.slice(),callsigns:x.callsigns.slice(),gaps:x.gaps.slice()}));}
window.KsuOffshoreCoverage={observe,snapshot,storageKey:KEY};
})();
