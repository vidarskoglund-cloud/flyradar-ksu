const $=x=>document.getElementById(x);
let planes=[], localPlanes=[], remoteKsuPlanes=[], display=false, selected=null, avinorFlights=[], lastGoodPlanes=[], sourceState={adsb:'ukjent',apl:'ukjent',fi:'ukjent'};
let idleFocusIndex=0;
const trackHistory=new Map();
const routeCache=new Map();
const recentPlaneCache=new Map();
const LOST_SIGNAL_KEEP_MS=3*60*1000;
const KSU_LOST_SIGNAL_KEEP_MS=10*60*1000;
let notified50=new Set(), notificationBaselineReady=false;
const WORKER_URL='https://flyradar-ksu.vidar-skoglund.workers.dev/aircraft';
const mapAreas={
  airport:{label:'Kvernberget',lat:63.1118,lon:7.8245},
  city:{label:'Kristiansund sentrum',lat:63.1103,lon:7.7279}
};
let map=L.map('map',{zoomControl:true}).setView([63.1118,7.8245],7);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18}).addTo(map);
let layer=L.layerGroup().addTo(map);
let rangeLayer=L.layerGroup().addTo(map);
let offshoreLayer=L.layerGroup().addTo(map);
let routeLayer=L.layerGroup().addTo(map);
let trackLayer=L.layerGroup().addTo(map);
let airportLayer=L.layerGroup().addTo(map);

const norwayAirports=[
  {code:'OSL',name:'Oslo Gardermoen',lat:60.1939,lon:11.1004,major:true},
  {code:'BGO',name:'Bergen Flesland',lat:60.2934,lon:5.2181,major:true},
  {code:'TRD',name:'Trondheim Værnes',lat:63.4578,lon:10.9240,major:true},
  {code:'SVG',name:'Stavanger Sola',lat:58.8768,lon:5.6379,major:true},
  {code:'TOS',name:'Tromsø Langnes',lat:69.6833,lon:18.9189,major:true},
  {code:'KRS',name:'Kristiansand Kjevik',lat:58.2042,lon:8.0854,major:true},
  {code:'BOO',name:'Bodø',lat:67.2692,lon:14.3653,major:true},
  {code:'AES',name:'Ålesund Vigra',lat:62.5625,lon:6.1197,major:true},
  {code:'TRF',name:'Sandefjord Torp',lat:59.1867,lon:10.2586,major:true},
  {code:'HAU',name:'Haugesund Karmøy',lat:59.3453,lon:5.2084},
  {code:'ALF',name:'Alta',lat:69.9761,lon:23.3717},
  {code:'ANX',name:'Andøya Andenes',lat:69.2925,lon:16.1442},
  {code:'BDU',name:'Bardufoss',lat:69.0558,lon:18.5404},
  {code:'BVG',name:'Berlevåg',lat:70.8714,lon:29.0342},
  {code:'BNN',name:'Brønnøysund',lat:65.4611,lon:12.2175},
  {code:'BJF',name:'Båtsfjord',lat:70.6003,lon:29.6925},
  {code:'FRO',name:'Florø',lat:61.5836,lon:5.0247},
  {code:'FDE',name:'Førde Bringeland',lat:61.3911,lon:5.7569},
  {code:'HFT',name:'Hammerfest',lat:70.6797,lon:23.6686},
  {code:'EVE',name:'Harstad/Narvik Evenes',lat:68.4913,lon:16.6781},
  {code:'HAA',name:'Hasvik',lat:70.4867,lon:22.1397},
  {code:'HVG',name:'Honningsvåg Valan',lat:71.0097,lon:25.9836},
  {code:'KKN',name:'Kirkenes Høybuktmoen',lat:69.7258,lon:29.8913},
  {code:'KSU',name:'Kristiansund Kvernberget',lat:63.1118,lon:7.8245,major:true},
  {code:'LKL',name:'Lakselv Banak',lat:70.0688,lon:24.9735},
  {code:'LKN',name:'Leknes',lat:68.1525,lon:13.6094},
  {code:'MEH',name:'Mehamn',lat:71.0297,lon:27.8267},
  {code:'MQN',name:'Mo i Rana Røssvoll',lat:66.3639,lon:14.3014},
  {code:'MOL',name:'Molde Årø',lat:62.7447,lon:7.2625},
  {code:'MJF',name:'Mosjøen Kjærstad',lat:65.7839,lon:13.2149},
  {code:'OSY',name:'Namsos',lat:64.4722,lon:11.5786},
  {code:'RRS',name:'Røros',lat:62.5784,lon:11.3423},
  {code:'RVK',name:'Rørvik Ryum',lat:64.8383,lon:11.1461},
  {code:'RET',name:'Røst',lat:67.5278,lon:12.1033},
  {code:'SDN',name:'Sandane Anda',lat:61.8300,lon:6.1058},
  {code:'SSJ',name:'Sandnessjøen Stokka',lat:65.9568,lon:12.4689},
  {code:'SOG',name:'Sogndal Haukåsen',lat:61.1561,lon:7.1378},
  {code:'SKN',name:'Stokmarknes Skagen',lat:68.5788,lon:15.0334},
  {code:'LYR',name:'Svalbard Longyearbyen',lat:78.2461,lon:15.4656},
  {code:'SVJ',name:'Svolvær Helle',lat:68.2433,lon:14.6692},
  {code:'SOJ',name:'Sørkjosen',lat:69.7868,lon:20.9594},
  {code:'VDS',name:'Vadsø',lat:70.0653,lon:29.8447},
  {code:'VAW',name:'Vardø Svartnes',lat:70.3554,lon:31.0449},
  {code:'HOV',name:'Ørsta/Volda Hovden',lat:62.1800,lon:6.0741},
  {code:'SRP',name:'Stord Sørstokken',lat:59.7919,lon:5.3409}
];

function renderNorwayAirports(){
  airportLayer.clearLayers();
  const zoom=map.getZoom();
  norwayAirports.forEach(a=>{
    if(a.code==='KSU')return;
    if(zoom<6 && !a.major)return;
    const marker=L.marker([a.lat,a.lon],{
      icon:airportIcon(a.code,a.name,'network'),
      zIndexOffset:300
    }).bindTooltip(`${a.code} · ${a.name}`,{direction:'top'});
    marker.addTo(airportLayer);
  });
}
function airportIcon(code,label,kind='route',compact=false){
  const safeCode=String(code||'APT').toUpperCase();
  const safeLabel=String(label||'Flyplass');
  const isHome=kind==='home';
  const showLabel=isHome&&!compact;
  return L.divIcon({
    className:'airport-wrap',
    html:`<div class="airport-marker ${kind} ${compact?'compact':''}">
      <span class="airport-symbol">✈</span>
      <div><b>${safeCode}</b>${showLabel?`<small>${safeLabel}</small>`:''}</div>
    </div>`,
    iconSize:isHome?(compact?[58,30]:[104,38]):[58,30],
    iconAnchor:isHome?(compact?[15,15]:[18,19]):[15,15]
  });
}
let home=L.marker([63.1118,7.8245],{
  icon:airportIcon('KSU','Kvernberget','home',false),
  zIndexOffset:900
}).bindTooltip('KSU / Kvernberget',{direction:'top'}).addTo(map);
function updateHomeAirportMarker(){
  const zoom=map.getZoom();
  if(zoom>=13){
    if(map.hasLayer(home))map.removeLayer(home);
    return;
  }
  if(!map.hasLayer(home))home.addTo(map);
  const compact=zoom>=11;
  home.setIcon(airportIcon('KSU','Kvernberget','home',compact));
}
map.on('zoomend',()=>{try{updateRangeRings(settings());renderNorwayAirports();updateHomeAirportMarker()}catch(e){}});
renderNorwayAirports();
updateHomeAirportMarker();

const rad=x=>x*Math.PI/180;
const nm=km=>km/1.852;
function dist(a,b,c,d){let R=6371,x=rad(c-a),y=rad(d-b),q=Math.sin(x/2)**2+Math.cos(rad(a))*Math.cos(rad(c))*Math.sin(y/2)**2;return 2*R*Math.atan2(Math.sqrt(q),Math.sqrt(1-q))}
function f(v,u=''){return(v===undefined||v===null||v==='ground')?'–':Math.round(+v)+u}
function fNm(km){return km==null?'–':nm(km).toFixed(1)+' NM'}
function localRelevant(p){
  const distanceNm=nm(p.d);
  const alt=Number(p.alt);
  return distanceNm<=30 && Number.isFinite(alt) && alt<=25000;
}
function observablePasserby(p){
  if(!p || p.ksuFlight)return false;
  const distanceNm=nm(p.d);
  const alt=Number(p.alt);
  if(!Number.isFinite(alt))return distanceNm<=10;
  if(distanceNm<=10 && alt<=18000)return true;
  if(distanceNm<=15 && alt<=12000)return true;
  if(distanceNm<=20 && alt<=8000)return true;
  return false;
}
function visibilityHint(p){
  if(!p||p.signalLost)return '';
  const distanceNm=nm(p.d);
  const alt=Number(p.alt);
  if(!Number.isFinite(alt))return distanceNm<=8?'Kan trolig ses/høres':'';
  if(distanceNm<=8&&alt<=12000)return 'Kan trolig ses/høres';
  if(distanceNm<=12&&alt<=7000)return 'Kan trolig ses/høres';
  if(distanceNm<=18&&alt<=5000)return 'Kan trolig høres';
  return '';
}
function passerbyScore(p){
  if(!observablePasserby(p))return 0;
  const distanceNm=nm(p.d);
  const alt=Number(p.alt);
  const distanceScore=Math.max(0,100-distanceNm*4);
  const altitudeScore=Number.isFinite(alt)?Math.max(0,40-alt/500):0;
  return distanceScore+altitudeScore;
}
function priorityPasserby(list){
  return list
    .filter(observablePasserby)
    .sort((a,b)=>passerbyScore(b)-passerbyScore(a)||a.d-b.d)[0]||null;
}

function mergeTrackedPlanes(local,remote){
  const byKey=new Map();
  [...local,...remote].forEach(p=>{
    const key=planeKey(p);
    if(!key)return;
    if(!byKey.has(key))byKey.set(key,p);
    else{
      const old=byKey.get(key);
      byKey.set(key,{...p,...old,remoteTracked:Boolean(old.remoteTracked||p.remoteTracked),ksuFlight:old.ksuFlight||p.ksuFlight||null});
    }
  });
  return [...byKey.values()].sort((a,b)=>a.d-b.d);
}
function retainRecentPlanes(current){
  const now=Date.now();
  const currentKeys=new Set();
  current.forEach(p=>{
    const key=planeKey(p);
    if(!key)return;
    currentKeys.add(key);
    recentPlaneCache.set(key,{plane:{...p,signalLost:false,lastSeenAt:now},lastSeenAt:now});
  });

  const retained=[...current];
  for(const [key,entry] of recentPlaneCache){
    if(currentKeys.has(key))continue;
    const age=now-entry.lastSeenAt;
    const keepMs=entry.plane.ksuFlight?KSU_LOST_SIGNAL_KEEP_MS:LOST_SIGNAL_KEEP_MS;
    if(age>keepMs){
      recentPlaneCache.delete(key);
      continue;
    }
    retained.push({...entry.plane,signalLost:true,lastSeenAt:entry.lastSeenAt});
  }
  return retained.sort((a,b)=>a.d-b.d);
}
function signalStateText(p){
  if(!p?.signalLost)return '';
  const ageSec=Math.max(0,Math.round((Date.now()-(p.lastSeenAt||Date.now()))/1000));
  const near=nearestKnownAirport(p,4);
  const gs=Number(p.gs);
  const alt=Number(p.alt);
  if(near){
    const onGroundLike=(Number.isFinite(gs)&&gs<=25)||(Number.isFinite(alt)&&alt<=1500&&Number.isFinite(gs)&&gs<=45);
    if(onGroundLike){
      if(ageSec>=60)return `Parkert ved ${near.airport.code}`;
      return `Landet ved ${near.airport.code}`;
    }
  }
  if(p.ksuFlight)return `Signal midlertidig mistet · KSU-fly · sist sett ${ageSec<60?ageSec+' sek':Math.round(ageSec/60)+' min'} siden`;
  return `Signal mistet · sist sett ${ageSec<60?ageSec+' sek':Math.round(ageSec/60)+' min'} siden`;
}
function trackingCallsign(flightId){
  const id=compactFlightId(flightId);
  const m=id.match(/^([A-Z]{2,3})(\d+[A-Z]?)$/);
  if(!m)return id;
  const map={SK:'SAS',WF:'WIF'};
  return (map[m[1]]||m[1])+m[2];
}
function remoteArrivalCandidates(){
  const now=Date.now();
  return avinorFlights
    .filter(f=>{
      if(f.arr_dep==='D')return false;
      const status=String(f.status_code||'').toUpperCase();
      if(status==='C'||status==='A')return false;
      const t=Date.parse(f.schedule_time||'');
      return Number.isFinite(t)&&t>=now-25*60*1000&&t<=now+120*60*1000;
    })
    .sort((a,b)=>Date.parse(a.schedule_time)-Date.parse(b.schedule_time))
    .slice(0,4);
}
async function fetchRemoteCallsign(callsign){
  if(!callsign)return null;
  const urls=[
    'https://api.airplanes.live/v2/callsign/'+encodeURIComponent(callsign),
    'https://api.adsb.lol/v2/callsign/'+encodeURIComponent(callsign)
  ];
  for(const url of urls){
    try{
      const j=await fetchJson(url);
      const rows=Array.isArray(j?.ac)?j.ac:[];
      const found=rows.find(a=>compactFlightId(a.flight)===compactFlightId(callsign))||rows[0]||null;
      if(found)return found;
    }catch(e){}
  }
  return null;
}
async function routeForCallsign(callsign,lat,lon){
  try{
    const u=new URL('https://flyradar-ksu.vidar-skoglund.workers.dev/route');
    u.searchParams.set('callsign',callsign);
    if(Number.isFinite(Number(lat)))u.searchParams.set('lat',lat);
    if(Number.isFinite(Number(lon)))u.searchParams.set('lon',lon);
    const r=await fetch(u,{cache:'no-store',credentials:'omit'});
    if(!r.ok)return null;
    const j=await r.json();
    return j?.route||null;
  }catch(e){
    return null;
  }
}
function routeContainsAirport(route,code){
  const c=String(code||'').toUpperCase();
  const raw=String(route?.airport_codes||'').toUpperCase();
  if(raw.includes(c))return true;
  const aps=Array.isArray(route?._airports)?route._airports:[];
  return aps.some(a=>[a.iata,a.icao,a.code].some(x=>String(x||'').toUpperCase()===c));
}
async function discoverKsuAircraftFromDeparture(f){
  const origin=airportByCode(f?.airport);
  if(!origin)return null;
  try{
    const url=`https://api.airplanes.live/v2/point/${origin.lat}/${origin.lon}/25`;
    const j=await fetchJson(url);
    const rows=(Array.isArray(j?.ac)?j.ac:[]).filter(a=>{
      const cs=compactFlightId(a.flight);
      if(!cs)return false;
      const airline=compactFlightId(f.airline||'');
      if(/^WF/.test(compactFlightId(f.flight_id||'')))return cs.startsWith('WIF');
      if(/^SK/.test(compactFlightId(f.flight_id||'')))return cs.startsWith('SAS');
      return airline?cs.startsWith(airline):true;
    }).slice(0,8);

    for(const a of rows){
      const callsign=String(a.flight||'').trim();
      const route=await routeForCallsign(callsign,a.lat,a.lon);
      if(routeContainsAirport(route,'KSU')&&routeContainsAirport(route,origin.code)){
        a._matchedRoute=route;
        return a;
      }
    }
  }catch(e){}
  return null;
}
async function updateRemoteKsuTracking(){
  if(!avinorFlights.length)return;
  const s=settings();
  const found=[];
  const candidates=remoteArrivalCandidates();
  for(let i=0;i<candidates.length;i++){
    const f=candidates[i];
    const callsign=trackingCallsign(f.flight_id);
    let raw=await fetchRemoteCallsign(callsign);
    if(!raw)raw=await discoverKsuAircraftFromDeparture(f);
    if(raw&&raw.lat!=null&&raw.lon!=null){
      const p=normalize({...raw,_source:'airplanes.live · KSU fjernsporing'},s);
      p.remoteTracked=true;
      p.ksuFlight=f;
      if(raw._matchedRoute){
        p.routeData=raw._matchedRoute;
        p.route=routeText(raw._matchedRoute);
      }
      found.push(p);
    }
    if(i<candidates.length-1)await new Promise(resolve=>setTimeout(resolve,1100));
  }
  remoteKsuPlanes=found;
  planes=retainRecentPlanes(mergeTrackedPlanes(localPlanes,remoteKsuPlanes));
  attachAvinorMatches();
}

function airportByCode(code){
  const c=String(code||'').toUpperCase();
  if(c==='KSU')return {code:'KSU',name:'Kristiansund Kvernberget',lat:63.1118,lon:7.8245};
  return norwayAirports.find(a=>a.code===c)||null;
}
function isGroundOrTaxi(p){
  const altRaw=p?.alt;
  const alt=Number(altRaw);
  const gs=Number(p?.gs);
  if(String(altRaw||'').toLowerCase()==='ground')return true;
  if(Number.isFinite(alt)&&alt<=1200&&Number.isFinite(gs)&&gs<=80)return true;
  return false;
}
function nearestKnownAirport(p,maxNm=6){
  if(!p||!Number.isFinite(Number(p.lat))||!Number.isFinite(Number(p.lon)))return null;
  let best=null;
  for(const a of norwayAirports){
    const dNm=nm(dist(p.lat,p.lon,a.lat,a.lon));
    if(dNm<=maxNm && (!best||dNm<best.dNm))best={airport:a,dNm};
  }
  return best;
}
function genericAirportFocus(p){
  if(!p)return null;
  const gs=Number(p.gs);
  const altRaw=p.alt;
  const alt=Number(altRaw);
  const vr=Number(p.vr);
  const near=nearestKnownAirport(p,6);

  // På bakken / taxi ved kjent flyplass. Fart er viktigere enn barometrisk høyde,
  // siden enkelte mottakere ikke rapporterer "ground" konsekvent.
  if(near && (
    String(altRaw||'').toLowerCase()==='ground' ||
    (Number.isFinite(gs)&&gs<=60&&near.dNm<=3.5) ||
    (Number.isFinite(alt)&&alt<=2500&&Number.isFinite(gs)&&gs<=80&&near.dNm<=2)
  )){
    return {airport:near.airport,dNm:near.dNm,mode:'ground',label:`På bakken ved ${near.airport.code}`};
  }

  // Lavt fly tett på en kjent flyplass skal få flyplasszoom selv om
  // rute/destinasjon ennå ikke er identifisert.
  if(near && Number.isFinite(alt) && alt<=3000 &&
     Number.isFinite(gs) && gs<=200 && near.dNm<=5.5){
    return {airport:near.airport,dNm:near.dNm,mode:'approach',label:`Nær ${near.airport.code} · lav høyde`};
  }

  // Bekreftet eller sannsynlig destinasjon for siste del av innflygingen.
  let target=null;
  const info=ksuFlightInfo(p);
  if(info?.direction==='Ankomst KSU'){
    target=airportByCode('KSU');
  }else{
    const aps=Array.isArray(p.routeData?._airports)?p.routeData._airports:[];
    const last=aps.length?aps[aps.length-1]:null;
    const code=last?.iata||last?.code||'';
    target=airportByCode(code);
    if(!target){
      const inferred=inferredRouteLabel(p);
      if(inferred)target=airportByCode(inferred.code);
    }
  }
  if(!target)return null;

  const dNm=nm(dist(p.lat,p.lon,target.lat,target.lon));
  const descending=Number.isFinite(vr)&&vr<-100;
  const low=Number.isFinite(alt)&&alt<=7000;
  if(dNm<=12&&(descending||low)){
    return {airport:target,dNm,mode:'approach',label:`Innflyging mot ${target.code}`};
  }
  return null;
}
function focusAirportArrival(p,ctx){
  if(!p||!ctx)return false;
  const airportPos=[ctx.airport.lat,ctx.airport.lon];
  const planePos=[p.lat,p.lon];

  if(ctx.mode==='ground'){
    // Omtrent samme utsnitt som manuelt nærzoom på HOV/TRD.
    map.setView(planePos,15);
  }else{
    let zoom=11;
    if(ctx.dNm<=8)zoom=12;
    if(ctx.dNm<=5)zoom=13;
    if(ctx.dNm<=2.5)zoom=14;
    if(ctx.dNm<=1)zoom=15;
    map.fitBounds(L.latLngBounds([airportPos,planePos]),{padding:[70,70],maxZoom:zoom});
    if(map.getZoom()<Math.min(zoom,12))map.setZoom(Math.min(zoom,12));
  }

  selected=p;
  select(p,false);
  if($('fs-status'))$('fs-status').textContent=ctx.label+' · '+(p.flight||p.reg||p.hex);
  return true;
}

function ksuGroundContext(p){
  const info=ksuFlightInfo(p);
  const f=p?.ksuFlight;
  if(!info||!f||!isGroundOrTaxi(p))return null;

  const code=info.direction==='Ankomst KSU' ? f.airport : 'KSU';
  const airport=airportByCode(code);
  if(!airport)return null;

  const d=nm(dist(airport.lat,airport.lon,p.lat,p.lon));
  if(d>6)return null;

  return {
    airport,
    label:info.direction==='Ankomst KSU'
      ? `På bakken ved ${airport.code} før KSU`
      : 'På bakken ved KSU før avgang'
  };
}

function ksuPriorityScore(p){
  const info=ksuFlightInfo(p);
  if(!info)return 0;
  if(ksuGroundContext(p))return 1100;
  const d=nm(p.d);
  const alt=Number(p.alt);
  if(info.direction==='Ankomst KSU'){
    if(info.status==='Landet')return 0;
    if(d<=20)return 1000;
    if(d<=50)return 950;
    if(d<=150)return 900;
    return p.remoteTracked?850:0;
  }
  if(info.direction==='Avgang KSU'){
    if(info.status==='Innstilt')return 0;
    if(d<=75&&(!Number.isFinite(alt)||alt<=20000))return 925;
  }
  return 0;
}
function priorityKsuAircraft(list){
  return list
    .map(p=>({p,score:ksuPriorityScore(p)}))
    .filter(x=>x.score>0)
    .sort((a,b)=>b.score-a.score||a.p.d-b.p.d)[0]?.p||null;
}

function settings(){return{lat:+$('lat').value,lon:+$('lon').value,r:+$('radius').value,area:$('area')?.value||'airport'}}
function save(){localStorage.setItem('ksuFly',JSON.stringify(settings()))}
function load(){try{let s=JSON.parse(localStorage.getItem('ksuFly')||'{}');if(s.lat)$('lat').value=s.lat;if(s.lon)$('lon').value=s.lon;if(s.r)$('radius').value=s.r;if(s.area&&$('area'))$('area').value=s.area}catch(e){}}
function normalize(a,s){
  let lat=a.lat,lon=a.lon;
  return{
    hex:a.hex||'',flight:(a.flight||'').trim(),reg:a.r||'',type:a.t||'',
    operator:a.ownOp||a.operator||'',desc:a.desc||'',lat,lon,
    alt:Number.isFinite(Number(a.alt_baro??a.alt_geom))?Number(a.alt_baro??a.alt_geom):a.alt_baro??a.alt_geom,gs:Number.isFinite(Number(a.gs))?Number(a.gs):a.gs,track:Number.isFinite(Number(a.track??a.true_heading??a.mag_heading))?Number(a.track??a.true_heading??a.mag_heading):a.track??a.true_heading??a.mag_heading,
    vr:a.baro_rate??a.geom_rate,d:dist(s.lat,s.lon,lat,lon),route:null,routeData:null,source:a._source||'adsb.lol'
  }
}
function getTrackDeg(p){
  const values=[p.track,p.true_track,p.true_heading,p.mag_heading];
  for(const v of values){
    const n=Number(v);
    if(Number.isFinite(n))return ((n%360)+360)%360;
  }
  return null;
}
function planeIcon(p){
  const tr=getTrackDeg(p)??0;
  return L.divIcon({
    className:'plane-wrap',
    html:`<div class="plane-marker ${localRelevant(p)?'local':''}" style="transform:rotate(${tr}deg)">
      <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
        <path d="M16 1.5 L18.8 11.2 L29 15.2 L29 18.1 L18.6 16.7 L18 25.2 L22.1 28.5 L22.1 30 L16 28.3 L9.9 30 L9.9 28.5 L14 25.2 L13.4 16.7 L3 18.1 L3 15.2 L13.2 11.2 Z"/>
      </svg>
    </div>`,
    iconSize:[34,34],iconAnchor:[17,17]
  });
}
function planeKey(p){return String(p.hex||p.reg||p.flight||'').trim().toLowerCase()}
function ingestSharedTracks(shared){
  if(!shared||typeof shared!=='object')return false;
  const cutoff=Date.now()-5*60*1000;
  let used=false;
  for(const [key,points] of Object.entries(shared)){
    if(!Array.isArray(points))continue;
    const fresh=points
      .map(x=>({lat:Number(x.lat),lon:Number(x.lon),t:Number(x.t)}))
      .filter(x=>Number.isFinite(x.lat)&&Number.isFinite(x.lon)&&Number.isFinite(x.t)&&x.t>=cutoff);
    if(fresh.length){
      trackHistory.set(String(key).toLowerCase(),fresh);
      used=true;
    }
  }
  return used;
}
function updateTrackHistory(list){
  const now=Date.now();
  const keepMs=5*60*1000;
  const active=new Set();
  list.forEach(p=>{
    const key=planeKey(p);
    if(!key||!Number.isFinite(p.lat)||!Number.isFinite(p.lon))return;
    active.add(key);
    const arr=trackHistory.get(key)||[];
    const last=arr[arr.length-1];
    if(!last || dist(last.lat,last.lon,p.lat,p.lon)>0.05 || now-last.t>15000){
      arr.push({lat:p.lat,lon:p.lon,t:now});
    }
    const fresh=arr.filter(x=>now-x.t<=keepMs);
    trackHistory.set(key,fresh);
  });
  for(const [key,arr] of trackHistory){
    const fresh=arr.filter(x=>now-x.t<=keepMs);
    if(fresh.length)trackHistory.set(key,fresh); else trackHistory.delete(key);
  }
}
function courseLabel(track){
  if(!Number.isFinite(Number(track)))return'ukjent retning';
  const dirs=['nord','nordøst','øst','sørøst','sør','sørvest','vest','nordvest'];
  const tr=((Number(track)%360)+360)%360;
  return dirs[Math.round(tr/45)%8];
}
function predictedPoints(p){
  const gs=Number(p.gs);
  const tr=getTrackDeg(p);
  if(!Number.isFinite(gs)||tr===null||gs<=0)return[];
  return [2,5,10].map(min=>{
    const nmAhead=gs*(min/60);
    const pos=destinationPoint(p.lat,p.lon,nmAhead,tr);
    return {min,nmAhead,pos};
  });
}
function drawTrackAndPrediction(p){
  trackLayer.clearLayers();
  if(!p)return;
  const key=planeKey(p);
  const hist=trackHistory.get(key)||[];
  if(hist.length>=2){
    L.polyline(hist.map(x=>[x.lat,x.lon]),{
      weight:4,
      opacity:.85
    }).bindTooltip('Faktisk spor · siste 5 min',{sticky:true}).addTo(trackLayer);
  }

  const info=ksuFlightInfo(p);
  if(info?.direction==='Ankomst KSU'){
    const ksu=[63.1118,7.8245];
    L.polyline([[p.lat,p.lon],ksu],{
      weight:3,
      opacity:.9,
      dashArray:'7 8'
    }).bindTooltip('Forventet videre mot Kvernberget',{sticky:true}).addTo(trackLayer);
    L.circleMarker(ksu,{radius:6,weight:2,fillOpacity:1})
      .bindTooltip('KSU · Kvernberget',{direction:'top'})
      .addTo(trackLayer);
    return;
  }

  const inferred=inferredRouteLabel(p);
  const hasConfirmedRoute=routeText(p.routeData)!=='Rute ikke tilgjengelig';
  if(inferred && !hasConfirmedRoute){
    const target=airportByCode(inferred.code);
    if(target){
      const targetPos=[target.lat,target.lon];
      L.polyline([[p.lat,p.lon],targetPos],{
        weight:3,
        opacity:.85,
        dashArray:'5 9'
      }).bindTooltip(`Antatt videre mot ${inferred.code} · ikke bekreftet`,{sticky:true}).addTo(trackLayer);
      L.circleMarker(targetPos,{radius:6,weight:2,fillOpacity:.75})
        .bindTooltip(`${inferred.label} · ${inferred.name} · ikke bekreftet`,{direction:'top'})
        .addTo(trackLayer);
      return;
    }
  }

  const preds=predictedPoints(p);
  if(preds.length){
    L.polyline([[p.lat,p.lon],...preds.map(x=>x.pos)],{
      weight:3,
      opacity:.8,
      dashArray:'7 8'
    }).bindTooltip('Estimert videre retning',{sticky:true}).addTo(trackLayer);
    preds.forEach(x=>{
      L.circleMarker(x.pos,{radius:4,weight:1,fillOpacity:1})
        .bindTooltip(`Estimert +${x.min} min`,{direction:'top'})
        .addTo(trackLayer);
    });
  }
}
function bearingBetween(lat1,lon1,lat2,lon2){
  const p1=rad(lat1),p2=rad(lat2),dl=rad(lon2-lon1);
  const y=Math.sin(dl)*Math.cos(p2);
  const x=Math.cos(p1)*Math.sin(p2)-Math.sin(p1)*Math.cos(p2)*Math.cos(dl);
  return (Math.atan2(y,x)*180/Math.PI+360)%360;
}
function angleDiff(a,b){
  return Math.abs((((a-b)+540)%360)-180);
}
function confirmedRouteDestination(p){
  const aps=Array.isArray(p?.routeData?._airports)?p.routeData._airports:[];
  if(aps.length<2 || routeText(p.routeData)==='Rute ikke tilgjengelig')return null;
  const last=aps[aps.length-1];
  const code=String(last.iata||last.code||last.icao||'').toUpperCase();
  const airport=airportByCode(code);
  return airport||null;
}
function movementDestination(p){
  if(!p)return null;

  // Bekreftet rutedata vinner alltid over retning/gjetting.
  const confirmed=confirmedRouteDestination(p);
  if(confirmed && confirmed.code!=='KSU')return {airport:confirmed,confirmed:true};

  // Avinor-bekreftet KSU-rute håndteres av KSU-logikken.
  if(p.ksuFlight)return null;

  const inferred=inferredRouteLabel(p);
  if(inferred){
    const airport=airportByCode(inferred.code);
    if(airport && airport.code!=='KSU')return {airport,confirmed:false};
  }
  return null;
}
function ksuMovementStatus(p){
  if(!p)return {label:'Retning usikker',detail:''};
  const distanceNm=nm(p.d);
  const alt=Number(p.alt);
  const vr=Number(p.vr);
  const tr=getTrackDeg(p);

  const destination=movementDestination(p);
  if(destination){
    const a=destination.airport;
    const dNm=nm(dist(p.lat,p.lon,a.lat,a.lon));
    const toAirport=bearingBetween(p.lat,p.lon,a.lat,a.lon);
    const diff=tr!==null?angleDiff(tr,toAirport):null;
    const descending=Number.isFinite(vr)&&vr<-250;
    const low=Number.isFinite(alt)&&alt<=9000;
    const toward=diff!==null&&diff<=55;

    if(dNm<=18 && low && descending && toward){
      return {
        label:`På innflyging mot ${a.code}`,
        detail:`${destination.confirmed?'bekreftet':'sannsynlig'} destinasjon · ${dNm.toFixed(0)} NM igjen`
      };
    }
    if(dNm<=55 && toward){
      return {
        label:`Nærmer seg ${a.code}`,
        detail:`${destination.confirmed?'bekreftet':'sannsynlig'} destinasjon · ${dNm.toFixed(0)} NM igjen`
      };
    }
    if(tr!==null){
      return {
        label:`Flyr ${courseLabel(tr)}over`,
        detail:`${destination.confirmed?'Rute mot':'Sannsynlig mot'} ${a.code} · kurs ${Math.round(tr)}°`
      };
    }
  }

  const toKsu=bearingBetween(p.lat,p.lon,63.1118,7.8245);
  const headingToKsu=tr!==null?angleDiff(tr,toKsu):null;

  const hist=trackHistory.get(planeKey(p))||[];
  let trendNm=null;
  if(hist.length>=2){
    const first=hist[0],last=hist[hist.length-1];
    const firstNm=nm(dist(63.1118,7.8245,first.lat,first.lon));
    const lastNm=nm(dist(63.1118,7.8245,last.lat,last.lon));
    trendNm=lastNm-firstNm;
  }

  const approachingByTrack=headingToKsu!==null&&headingToKsu<=55;
  const leavingByTrack=headingToKsu!==null&&headingToKsu>=125;
  const approachingByTrend=trendNm!==null&&trendNm<=-0.6;
  const leavingByTrend=trendNm!==null&&trendNm>=0.6;
  const descending=Number.isFinite(vr)&&vr<-250;

  if(distanceNm<=18 && Number.isFinite(alt) && alt<=9000 && descending && (approachingByTrack||approachingByTrend)){
    return {label:'Ser ut til å være på innflyging',detail:'mot Kvernberget'};
  }
  if((approachingByTrend || (approachingByTrack && distanceNm<=50)) && headingToKsu!==null && headingToKsu<=55){
    return {label:'Nærmer seg KSU',detail:`${Math.round(headingToKsu)}° fra direkte kurs mot KSU`};
  }
  if(leavingByTrend || (leavingByTrack && distanceNm<=50)){
    if(p.ksuFlight?.arr_dep==='D'){
      return {label:'Har forlatt KSU',detail:headingToKsu!==null?`${Math.round(headingToKsu)}° fra kurs mot KSU`:''};
    }
    if(tr!==null){
      const dir=courseLabel(tr);
      return {label:`Flyr ${dir}over`,detail:`kurs ${Math.round(tr)}° · bort fra KSU`};
    }
    return {label:'Flyr bort fra KSU',detail:''};
  }
  if(tr!==null){
    return {label:`Flyr ${courseLabel(tr)}over`,detail:`kurs ${Math.round(tr)}°`};
  }
  return {label:'Retning usikker',detail:''};
}
function movementText(p){
  const status=ksuMovementStatus(p);
  const preds=predictedPoints(p);
  const dir=courseLabel(getTrackDeg(p));
  const destination=movementDestination(p);
  const bits=[status.label];

  if(status.detail)bits.push(status.detail);

  if(destination){
    const a=destination.airport;
    const dNm=nm(dist(p.lat,p.lon,a.lat,a.lon));
    bits.push(`${destination.confirmed?'destinasjon':'sannsynlig destinasjon'} ${a.code}`);
    bits.push(`${dNm.toFixed(0)} NM til ${a.code}`);
  }else{
    bits.push(`retning ${dir}`);
    const p5=preds.find(x=>x.min===5);
    if(p5)bits.push(`+5 min ca. ${p5.nmAhead.toFixed(0)} NM`);
  }
  return bits.join(' · ');
}
function destinationPoint(lat,lon,distanceNm,bearingDeg){
  const R=6371, d=distanceNm*1.852/R, br=rad(bearingDeg), p1=rad(lat), l1=rad(lon);
  const p2=Math.asin(Math.sin(p1)*Math.cos(d)+Math.cos(p1)*Math.sin(d)*Math.cos(br));
  const l2=l1+Math.atan2(Math.sin(br)*Math.sin(d)*Math.cos(p1),Math.cos(d)-Math.sin(p1)*Math.sin(p2));
  return [p2*180/Math.PI,((l2*180/Math.PI+540)%360)-180];
}
function updateRangeRings(s){
  rangeLayer.clearLayers();
  const zoom=map.getZoom();
  const rings=zoom<8?[50]:zoom<10?[25,50]:[10,25,50];

  rings.forEach(n=>{
    const active=+s.r===n;
    L.circle([s.lat,s.lon],{
      radius:n*1852,
      color:active?'#6ee7ff':'#6b8198',
      weight:active?2.4:1.2,
      opacity:active?0.9:0.55,
      fill:false,
      dashArray:active?null:'6 8',
      interactive:false
    }).addTo(rangeLayer);

    const pos=destinationPoint(s.lat,s.lon,n,0);
    L.marker(pos,{interactive:false,icon:L.divIcon({
      className:'range-label-wrap',
      html:`<div class="range-label ${active?'active':''}">${n} NM</div>`,
      iconSize:[58,20],iconAnchor:[29,10]
    })}).addTo(rangeLayer);
  });
}
function areaBounds(lat,lon,radiusNm){
  return L.latLngBounds([
    destinationPoint(lat,lon,radiusNm,0),
    destinationPoint(lat,lon,radiusNm,90),
    destinationPoint(lat,lon,radiusNm,180),
    destinationPoint(lat,lon,radiusNm,270)
  ]);
}
function applyMapLevel(s){
  const viewRadius=+s.r;
  document.body.classList.toggle('overview-map',viewRadius>=150);
  const a=mapAreas[s.area]||mapAreas.airport;
  const allowed=L.latLngBounds([[57.5,3.5],[72.0,32.5]]);
  map.setMaxBounds(allowed);
  map.options.maxBoundsViscosity=0.8;
  map.setMinZoom(4);
  const pad=viewRadius<=10?[18,18]:[28,28];
  map.fitBounds(areaBounds(a.lat,a.lon,viewRadius),{padding:pad});
}
function idleCandidates(list){
  return list.slice().sort((a,b)=>a.d-b.d).filter(p=>nm(p.d)>50).slice(0,3);
}
function focusIdleCandidate(list,advance=false){
  const candidates=idleCandidates(list);
  if(!candidates.length)return false;
  if(advance)idleFocusIndex=(idleFocusIndex+1)%candidates.length;
  if(idleFocusIndex>=candidates.length)idleFocusIndex=0;
  const p=candidates[idleFocusIndex];
  selected=p;
  map.setView([p.lat,p.lon],8);
  select(p,false);
  if($('fs-status'))$('fs-status').textContent=`rolig visning · fly ${idleFocusIndex+1}/${candidates.length}`;
  return true;
}
function followNearest(list,s){
  const sorted=list.slice().sort((a,b)=>a.d-b.d);
  const priority=priorityKsuAircraft(sorted);
  const passerby=!priority?priorityPasserby(sorted):null;
  const nearest=priority||passerby||sorted[0];
  if(!nearest){ applyMapLevel(s); return; }

  const airport=[63.1118,7.8245];
  const nearestNm=nm(nearest.d);
  const ground=priority?ksuGroundContext(priority):null;
  const airportFocus=genericAirportFocus(nearest);

  // KSU-prioritet beholdes. For andre fly får siste del av innflyging / bakken
  // tett flyplassutsnitt i stedet for vanlig oversiktszoom.
  if(!priority && airportFocus && focusAirportArrival(nearest,airportFocus)){
    idleFocusIndex=0;
    return;
  }

  if(priority && ground){
    idleFocusIndex=0;
    const points=[[ground.airport.lat,ground.airport.lon],[priority.lat,priority.lon]];
    map.fitBounds(L.latLngBounds(points),{
      padding:[55,55],
      maxZoom:14
    });
    if(map.getZoom()<12)map.setZoom(12);
    selected=priority;
    select(priority,false);
    if($('fs-status'))$('fs-status').textContent=ground.label+' · '+(priority.flight||priority.reg||priority.hex);
    return;
  }

  if(priority && nearestNm>50){
    idleFocusIndex=0;
    map.fitBounds(L.latLngBounds([airport,[priority.lat,priority.lon]]),{
      padding:[55,55],
      maxZoom:7
    });
    selected=priority;
    select(priority,false);
    if($('fs-status'))$('fs-status').textContent='følger KSU-rute · '+(priority.flight||priority.reg||priority.hex);
    return;
  }

  if(priority && nearestNm<=50){
    idleFocusIndex=0;
    let maxZoom=8;
    let padding=[85,85];
    if(nearestNm<=30)maxZoom=9;
    if(nearestNm<=20){maxZoom=9;padding=[95,95];}
    if(nearestNm<=12){maxZoom=10;padding=[105,105];}
    if(nearestNm<=6){maxZoom=11;padding=[115,115];}
    if(nearestNm<=2){maxZoom=12;padding=[125,125];}

    const bounds=L.latLngBounds([airport,[priority.lat,priority.lon]]);
    map.fitBounds(bounds,{padding,maxZoom});

    // Sikkerhet: flyet skal alltid være synlig i kartbildet.
    if(!map.getBounds().pad(-0.08).contains([priority.lat,priority.lon])){
      map.fitBounds(bounds,{padding:[135,135],maxZoom:Math.max(7,maxZoom-1)});
    }

    selected=priority;
    select(priority,false);
    return;
  }

  if(nearestNm<=10){
    idleFocusIndex=0;
    let maxZoom=11;
    if(nearestNm<=5)maxZoom=12;
    if(nearestNm<=2)maxZoom=13;
    map.fitBounds(L.latLngBounds([airport,[nearest.lat,nearest.lon]]),{
      padding:[70,70],
      maxZoom
    });
    return;
  }

  if(nearestNm<=50){
    idleFocusIndex=0;
    const nearby=sorted.filter(p=>nm(p.d)<=50);
    const points=[airport,...nearby.map(p=>[p.lat,p.lon])];
    map.fitBounds(L.latLngBounds(points),{
      padding:[60,60],
      maxZoom:9
    });
    return;
  }

  if(!focusIdleCandidate(sorted,false))applyMapLevel(s);
}
function fitMap(list,s){
  followNearest(list,s);
}
function airportLabel(a){
  if(!a)return'';
  const code=a.iata||a.icao||a.code||'';
  const place=a.city||a.name||'';
  if(place&&code)return `${place} (${code})`;
  return place||code;
}
function routeText(r){
  if(!r||r.plausible===false||r.airport_codes==='unknown')return'Rute ikke tilgjengelig';
  const aps=Array.isArray(r._airports)?r._airports:[];
  if(aps.length>=2){
    const from=airportLabel(aps[0]),to=airportLabel(aps[aps.length-1]);
    if(from&&to)return `${from} → ${to}`;
  }
  if(r.airport_codes&&r.airport_codes!=='unknown'){
    return String(r.airport_codes).replace(/[-_]/g,' → ');
  }
  return'Rute ikke tilgjengelig';
}
function routeCardParts(p){
  const r=p?.routeData;
  const aps=Array.isArray(r?._airports)?r._airports:[];
  if(aps.length>=2){
    const from=aps[0],to=aps[aps.length-1];
    return {
      fromCode:from.iata||from.icao||from.code||'–',
      fromPlace:from.city||from.name||'',
      toCode:to.iata||to.icao||to.code||'–',
      toPlace:to.city||to.name||''
    };
  }
  const txt=displayRoute(p);
  const parts=txt.split('→').map(x=>x.trim());
  if(parts.length===2){
    return {fromCode:parts[0],fromPlace:'',toCode:parts[1],toPlace:''};
  }
  return null;
}
function specialService(p){
  const f=(p.flight||'').toUpperCase();
  const op=(p.operator||'').toLowerCase();
  const desc=(p.desc||'').toLowerCase();
  const type=(p.type||'').toUpperCase();

  if(f==='BNOV' || /babcock|luftambulanse|air ambulance|ambulance/.test(op+' '+desc)) return 'Ambulansefly';
  if(/politi|police/.test(op+' '+desc) || /^POL/.test(f)) return 'Politi';
  if(/redning|rescue|sar/.test(op+' '+desc) || /^SAR/.test(f)) return 'Redning';
  if(/military|air force|forsvaret/.test(op+' '+desc)) return 'Militær';
  if(/helicopter|helikopter|chc/.test(op+' '+desc) || /^HK[SM]/.test(f) || type.startsWith('S92')) return 'Offshorehelikopter';
  return '';
}
function inferredAirportCandidate(p){
  if(!p||p.ksuFlight||p.signalLost)return null;
  const tr=getTrackDeg(p);
  const alt=Number(p.alt);
  const vr=Number(p.vr);
  if(tr===null)return null;

  // Ikke gjett destinasjon fra én enkelt kursmåling. Krev et stabilt spor
  // over minst 30 sekunder som faktisk beveger seg mot samme flyplass.
  const hist=(trackHistory.get(planeKey(p))||[])
    .filter(x=>Date.now()-x.t<=2*60*1000)
    .sort((a,b)=>a.t-b.t);
  if(hist.length<3)return null;
  const first=hist[0], last=hist[hist.length-1];
  if(last.t-first.t<30000)return null;

  const candidates=norwayAirports.map(a=>{
    const dNm=nm(dist(p.lat,p.lon,a.lat,a.lon));
    if(dNm>45)return null;
    const bearing=bearingBetween(p.lat,p.lon,a.lat,a.lon);
    const diff=angleDiff(tr,bearing);
    if(diff>22)return null;

    const firstD=nm(dist(first.lat,first.lon,a.lat,a.lon));
    const lastD=nm(dist(last.lat,last.lon,a.lat,a.lon));
    const closing=firstD-lastD;
    if(closing<0.8)return null;

    // Høyt fly i marsjhøyde skal ikke få tidlig flyplassgjetning.
    const descending=Number.isFinite(vr)&&vr<-250;
    if(Number.isFinite(alt)&&alt>18000&&!descending)return null;

    let score=0;
    score += Math.max(0,55-dNm);
    score += Math.max(0,30-diff)*1.5;
    score += Math.min(20,closing*6);
    if(descending)score+=15;
    if(Number.isFinite(alt)){
      if(dNm<=25&&alt<=12000)score+=15;
      if(dNm<=12&&alt<=7000)score+=15;
    }
    if(a.major)score+=3;
    return {airport:a,dNm,diff,score,closing};
  }).filter(Boolean).sort((a,b)=>b.score-a.score);

  const best=candidates[0];
  if(!best||best.score<75)return null;
  const second=candidates[1];
  if(second && best.score-second.score<12)return null;
  return best;
}
function inferredRouteLabel(p){
  const best=inferredAirportCandidate(p);
  if(!best)return null;
  return {
    code:best.airport.code,
    name:best.airport.name,
    distanceNm:best.dNm,
    label:`Sannsynlig ${best.airport.code}`
  };
}
function displayRoute(p){
  const service=specialService(p);
  if(service)return service;
  if(p.route&&p.route!=='Rute ikke tilgjengelig'&&p.route!=='Henter rute…')return p.route;
  const inferred=inferredRouteLabel(p);
  if(inferred)return `${inferred.label} · ${inferred.name}`;
  return p.route||'Henter rute…';
}
async function enrichRoute(p){
  if(!p||!p.flight)return;
  const key=p.flight.trim();
  if(routeCache.has(key)){
    const r=routeCache.get(key);
    p.routeData=r||null;
    p.route=routeText(r);
    if(selected&&selected.hex===p.hex)select(p,false);
    return;
  }
  try{
    const u=new URL('https://flyradar-ksu.vidar-skoglund.workers.dev/route');
    u.searchParams.set('callsign',key);
    u.searchParams.set('lat',p.lat);
    u.searchParams.set('lon',p.lon);
    if(Number.isFinite(Number(p.alt)))u.searchParams.set('alt',Number(p.alt));
    if(p.ksuFlight)u.searchParams.set('fa_scope','ksu');
    else if(observablePasserby(p))u.searchParams.set('fa_scope','local');
    const resp=await fetch(u,{cache:'no-store',credentials:'omit'});
    if(!resp.ok)throw new Error('HTTP '+resp.status);
    const j=await resp.json();
    const r=j?.route||null;
    routeCache.set(key,r);
    p.routeData=r;
    p.route=routeText(r);
    if(selected&&selected.hex===p.hex)select(p,false);
  }catch(e){
    routeCache.set(key,null);
    p.routeData=null;
    p.route='Rute ikke tilgjengelig';
    if(selected&&selected.hex===p.hex)select(p,false);
  }
}
function mergeAircraft(primary,secondary){
  const byKey=new Map();
  const add=(a,source)=>{
    const key=(a.hex||a.r||a.flight||'').toString().trim().toLowerCase();
    if(!key)return;
    const copy={...a,_source:source};
    if(!byKey.has(key))byKey.set(key,copy);
    else{
      const old=byKey.get(key);
      byKey.set(key,{...copy,...old,_source:old._source==='adsb.lol'?'adsb.lol + airplanes.live':source+' + '+old._source});
    }
  };
  primary.forEach(a=>add(a,'adsb.lol'));
  secondary.forEach(a=>add(a,'airplanes.live'));
  return [...byKey.values()];
}
async function fetchJson(url){
  try{
    const r=await fetch(url,{credentials:'omit'});
    if(!r.ok)throw new Error('HTTP '+r.status);
    return await r.json();
  }catch(e){
    const proxied='https://proxy.cors.dev/'+url;
    const r=await fetch(proxied,{credentials:'omit'});
    if(!r.ok)throw new Error('HTTP '+r.status);
    return await r.json();
  }
}
async function loadOffshore(){
  try{
    const url='https://factmaps.sodir.no/api/rest/services/Factmaps/FactMapsWGS84/FeatureServer/304/query?where=1%3D1&outFields=fclName,fclKind,fclSurface,fclStatus&returnGeometry=true&f=geojson';
    const r=await fetch(url);
    if(!r.ok)throw new Error('HTTP '+r.status);
    const gj=await r.json();
    offshoreLayer.clearLayers();
    (gj.features||[]).forEach(f=>{
      const c=f.geometry&&f.geometry.coordinates;
      if(!c||c.length<2)return;
      const p=f.properties||{};
      const dNm=nm(dist(63.1118,7.8245,c[1],c[0]));
      if(dNm>150)return;
      const name=p.fclName||'Offshore-installasjon';
      const kind=p.fclKind||p.fclSurface||'';
      const icon=L.divIcon({
        className:'offshore-wrap',
        html:'<div class="offshore-marker '+(settings().r>=150?'overview':'')+'">◆</div>',
        iconSize:[18,18],iconAnchor:[9,9]
      });
      L.marker([c[1],c[0]],{icon})
        .bindTooltip(name,{direction:'top'})
        .bindPopup('<b>'+name+'</b><br>'+[kind,p.fclStatus].filter(Boolean).join(' · ')+'<br>'+dNm.toFixed(0)+' NM fra KSU')
        .addTo(offshoreLayer);
    });
  }catch(e){}
}
async function loadAvinor(){
  try{
    const bucket=Math.floor(Date.now()/600000);
    const r=await fetch('data/avinor-ksu.json?v='+bucket,{cache:'no-store'});
    if(!r.ok)throw new Error('HTTP '+r.status);
    const j=await r.json();
    avinorFlights=Array.isArray(j.flights)?j.flights:[];
    await updateRemoteKsuTracking();
    attachAvinorMatches();
    renderAvinor();
    render(true);
  }catch(e){
    avinorFlights=[];
    attachAvinorMatches();
    renderAvinor();
  }
}
function avinorFlightKey(f){
  if(!f)return '';
  if(f.uniqueId)return String(f.uniqueId);
  return [f.flight_id||'',f.schedule_time||'',f.arr_dep||'',f.airport||''].join('|');
}
function renderAvinor(){
  const el=$('avinor-list'); if(!el)return;
  if(!avinorFlights.length){
    el.innerHTML='<div class="schedule-empty">Ingen planlagte KSU-data tilgjengelig akkurat nå.</div>';
    return;
  }
  const now=Date.now();
  const rows=avinorFlights
    .filter(f=>{const t=Date.parse(f.schedule_time||'');return !Number.isFinite(t)||t>=now-30*60*1000})
    .slice(0,6);

  el.innerHTML=rows.map((f,index)=>{
    const t=f.schedule_time?new Date(f.schedule_time).toLocaleTimeString('no-NO',{hour:'2-digit',minute:'2-digit'}):'–';
    const dep=f.arr_dep==='D';
    const heli=/^(HKS|HMB)/i.test(f.flight_id||'') || /helicopter/i.test((f.airline_name||'')+' '+(f.airline||''));
    const route=dep?`KSU → ${f.airport||'–'}`:`${f.airport||'–'} → KSU`;
    const key=avinorFlightKey(f);
    const livePlane=planes.find(p=>p.ksuFlight&&avinorFlightKey(p.ksuFlight)===key&&!p.signalLost)||null;
    const stalePlane=planes.find(p=>p.ksuFlight&&avinorFlightKey(p.ksuFlight)===key&&p.signalLost)||null;
    const matched=Boolean(livePlane);
    const staleMatched=Boolean(stalePlane);
    const statusText=avinorStatusText(f);
    const sched=Date.parse(f.schedule_time||'');
    const nearWindow=Number.isFinite(sched)&&Math.abs(sched-now)<=120*60*1000;

    let opStatus='';
    let statusClass='neutral';
    if(matched){
      opStatus='Følges nå';
      statusClass='live';
    }else if(statusText){
      opStatus=statusText;
      statusClass=statusText==='Innstilt'?'cancelled':statusText==='Landet'||statusText==='Avreist'?'done':'changed';
    }else if(staleMatched){
      opStatus='Midlertidig signalbortfall';
      statusClass='stale';
    }else if(nearWindow){
      opStatus='Venter på fly';
      statusClass='waiting';
    }

    const distanceText=livePlane?`${nm(livePlane.d).toFixed(0)} NM fra KSU`:'';
    const nextClass=index===0&&!statusText&&!matched?' next':'';
    return `<div class="schedule-row ${heli?'heli':''} ${matched?'matched':''} ${staleMatched?'stale':''}${nextClass}">
      <div class="schedule-direction ${dep?'dep':'arr'}">${dep?'AVG':'ANK'}</div>
      <div class="schedule-main">
        <div class="schedule-flightline">
          <b>${heli?'🚁 ':''}${f.flight_id||'Ukjent'}</b>
          <span class="schedule-route">${route}</span>
          ${opStatus?`<span class="schedule-status ${statusClass}">${opStatus}</span>`:''}
        </div>
        ${distanceText?`<div class="schedule-live-detail">${distanceText}</div>`:''}
      </div>
      <div class="schedule-time">${t}</div>
    </div>`;
  }).join('') || '<div class="schedule-empty">Ingen kommende flyvninger.</div>';
}

function compactFlightId(value){
  return String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
}
function flightAliases(value){
  const id=compactFlightId(value);
  const out=new Set();
  if(!id)return out;
  out.add(id);
  const m=id.match(/^([A-Z]{2,3})(\d+[A-Z]?)$/);
  if(!m)return out;
  const carrier=m[1],number=m[2];
  const pairs={SK:'SAS',SAS:'SK',WF:'WIF',WIF:'WF'};
  if(pairs[carrier])out.add(pairs[carrier]+number);
  return out;
}
function avinorStatusText(f){
  const code=String(f?.status_code||'').trim().toUpperCase();
  const known={A:'Landet',D:'Avreist',C:'Innstilt',E:'Ny tid'};
  return known[code]||'';
}

function pointToSegmentNm(pLat,pLon,aLat,aLon,bLat,bLon){
  const lat0=rad((aLat+bLat+pLat)/3);
  const x=(lon)=>rad(lon)*Math.cos(lat0)*3440.065;
  const y=(lat)=>rad(lat)*3440.065;
  const px=x(pLon),py=y(pLat),ax=x(aLon),ay=y(aLat),bx=x(bLon),by=y(bLat);
  const abx=bx-ax,aby=by-ay;
  const apx=px-ax,apy=py-ay;
  const len2=abx*abx+aby*aby;
  const t=len2?Math.max(0,Math.min(1,(apx*abx+apy*aby)/len2)):0;
  const cx=ax+t*abx,cy=ay+t*aby;
  return Math.hypot(px-cx,py-cy);
}
function plausibleKsuRouteCorridor(p,f){
  if(!p||!f)return false;
  const other=airportByCode(f.airport);
  if(!other)return true;
  const ksu={lat:63.1118,lon:7.8245};
  const corridorNm=pointToSegmentNm(p.lat,p.lon,other.lat,other.lon,ksu.lat,ksu.lon);
  const endDist=Math.min(
    nm(dist(p.lat,p.lon,other.lat,other.lon)),
    nm(dist(p.lat,p.lon,ksu.lat,ksu.lon))
  );
  // Tillat litt slingringsmonn nær endepunktene, men ikke fly langt utenfor ruten.
  return corridorNm<=45 || endDist<=30;
}

function avinorMatchPlausible(p,f,exact=false){
  if(!p||!f)return false;
  const status=String(f.status_code||'').toUpperCase();
  const dNm=nm(p.d);
  const alt=Number(p.alt);
  const gs=Number(p.gs);

  if(status==='C')return false;

  // En Avinor-rad som allerede er landet skal bare kunne kobles til et fly
  // helt ved KSU og med bakke-/lavfartskarakter. Den skal aldri kapre et
  // nytt fly i lufta.
  if(status==='A'){
    const nearKsu=dNm<=5;
    const low=!Number.isFinite(alt)||alt<=2500;
    const slow=!Number.isFinite(gs)||gs<=100;
    return nearKsu&&low&&slow;
  }

  // For ikke-eksakte matcher må flyet være i et realistisk KSU-vindu.
  if(!exact && f.arr_dep!=='D'){
    if(dNm>35)return false;
    if(Number.isFinite(alt)&&alt>18000)return false;
  }
  return true;
}

function findKsuFlight(p){
  if(!p?.flight||!avinorFlights.length)return null;
  const aliases=flightAliases(p.flight);
  if(!aliases.size)return null;
  const now=Date.now();

  const exact=avinorFlights.filter(f=>{
    const avAliases=flightAliases(f.flight_id);
    const same=[...aliases].some(x=>avAliases.has(x));
    if(!same)return false;
    if(!avinorMatchPlausible(p,f,true))return false;
    const t=Date.parse(f.schedule_time||'');
    return !Number.isFinite(t)||Math.abs(t-now)<=8*60*60*1000;
  });
  if(exact.length){
    exact.sort((a,b)=>{
      const ta=Date.parse(a.schedule_time||''),tb=Date.parse(b.schedule_time||'');
      const da=Number.isFinite(ta)?Math.abs(ta-now):Number.MAX_SAFE_INTEGER;
      const db=Number.isFinite(tb)?Math.abs(tb-now):Number.MAX_SAFE_INTEGER;
      return da-db;
    });
    return exact[0];
  }

  const callsign=compactFlightId(p.flight);
  const carrier=callsign.startsWith('WIF')?'WF':callsign.startsWith('SAS')?'SK':'';
  if(!carrier)return null;

  // Ankomster skal ikke lenger matches bare på flyselskap/tidsvindu.
  // De fanges via eksakt flightnummer eller fjernsporing/rutekontroll.
  // Dette hindrer f.eks. at et BGO→TOS-fly blir koblet til en gammel BGO→KSU-rad.
  const dNm=nm(p.d);
  const leaving=ksuMovementStatus(p).label==='Har forlatt KSU';

  const fallback=avinorFlights.filter(f=>{
    if(f.arr_dep!=='D')return false;
    if(!compactFlightId(f.flight_id).startsWith(carrier))return false;
    if(!avinorMatchPlausible(p,f,false))return false;
    const t=Date.parse(f.schedule_time||'');
    if(!Number.isFinite(t))return false;
    if(dNm>20)return false;
    if(!leaving && dNm>8)return false;
    return t>=now-30*60*1000 && t<=now+60*60*1000;
  });

  if(fallback.length!==1)return null;
  return fallback[0];
}
function attachAvinorMatches(){
  planes.forEach(p=>{
    const routeDest=confirmedRouteDestination(p);
    const existing=p.ksuFlight||null;
    const exactExisting=existing
      ? [...flightAliases(p.flight)].some(x=>flightAliases(existing.flight_id).has(x))
      : false;

    // Hvis bekreftet rutedata sier en annen destinasjon enn KSU, skal en
    // svak Avinor-fallback ikke få merke flyet som KSU-fly.
    if(routeDest && routeDest.code!=='KSU' && existing && !exactExisting){
      p.ksuFlight=null;
    }

    p.ksuFlight=p.ksuFlight||findKsuFlight(p);

    const matched=p.ksuFlight;
    if(matched && routeDest && routeDest.code!=='KSU'){
      const exact=[...flightAliases(p.flight)].some(x=>flightAliases(matched.flight_id).has(x));
      if(!exact)p.ksuFlight=null;
    }

    if(p.ksuFlight){
      const key=planeKey(p);
      const cached=recentPlaneCache.get(key);
      if(cached)cached.plane.ksuFlight=p.ksuFlight;
    }
  });
}
function ksuFlightInfo(p){
  const f=p?.ksuFlight;
  if(!f)return null;
  const dep=f.arr_dep==='D';
  const time=f.schedule_time
    ? new Date(f.schedule_time).toLocaleTimeString('no-NO',{hour:'2-digit',minute:'2-digit'})
    : '–';
  return {
    direction:dep?'Avgang KSU':'Ankomst KSU',
    route:dep?`KSU → ${f.airport||'–'}`:`${f.airport||'–'} → KSU`,
    time,
    status:avinorStatusText(f),
    flightId:f.flight_id||p.flight
  };
}
function ksuOperationalStatus(p){
  const info=ksuFlightInfo(p);
  if(!info)return ksuMovementStatus(p).label;
  const movement=ksuMovementStatus(p).label;
  const ground=ksuGroundContext(p);
  if(ground)return ground.label;
  if(info.direction==='Ankomst KSU'){
    if(info.status==='Landet')return 'Landet på Kvernberget';
    if(movement==='Ser ut til å være på innflyging')return 'På innflyging til Kvernberget';
    if(movement==='Nærmer seg KSU')return 'KSU-ankomst nærmer seg';
    return 'Planlagt ankomst KSU';
  }
  if(info.status==='Avreist')return 'Avreist fra Kvernberget';
  if(movement==='Forlater KSU')return 'Har forlatt Kvernberget';
  return 'Planlagt avgang KSU';
}

function base64UrlToUint8Array(base64Url){
  const padding='='.repeat((4-base64Url.length%4)%4);
  const base64=(base64Url+padding).replace(/-/g,'+').replace(/_/g,'/');
  const raw=atob(base64);
  return Uint8Array.from([...raw].map(ch=>ch.charCodeAt(0)));
}
async function subscribeBackgroundPush(){
  if(!('serviceWorker' in navigator) || !('PushManager' in window))return false;
  try{
    const keyResp=await fetch('https://flyradar-ksu.vidar-skoglund.workers.dev/push/public-key',{cache:'no-store'});
    if(!keyResp.ok)return false;
    const keyJson=await keyResp.json();
    if(!keyJson?.publicKey)return false;

    const reg=await navigator.serviceWorker.ready;
    let sub=await reg.pushManager.getSubscription();
    if(!sub){
      sub=await reg.pushManager.subscribe({
        userVisibleOnly:true,
        applicationServerKey:base64UrlToUint8Array(keyJson.publicKey)
      });
    }

    const save=await fetch('https://flyradar-ksu.vidar-skoglund.workers.dev/push/subscribe',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(sub)
    });
    return save.ok;
  }catch(e){
    return false;
  }
}
async function requestNotifications(){
  const standalone=window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone===true;
  const isiOS=/iPhone|iPad|iPod/i.test(navigator.userAgent);

  if(isiOS && !standalone){
    alert('På iPhone må Flyradar KSU først legges til på Hjem-skjermen. Åpne Del-menyen, velg «Legg til på Hjem-skjerm», åpne deretter Flyradar KSU fra ikonet og trykk «Aktiver varsling» igjen.');
    return;
  }

  if(!('Notification' in window)){
    alert('Varsling støttes ikke i denne nettleseren.');
    return;
  }

  const permission=await Notification.requestPermission();
  const b=$('notify');

  if(permission==='granted'){
    const backgroundOk=await subscribeBackgroundPush();
    if(b)b.textContent=backgroundOk?'Bakgrunnsvarsling aktiv':'Varsling aktiv';
    try{
      const reg=await navigator.serviceWorker.ready;
      await reg.showNotification('Flyradar KSU',{
        body:backgroundOk
          ?'Varsling er aktivert. Bakgrunnsvarsling er koblet til.'
          :'Varsling er aktivert for fly innen 50 NM.',
        tag:'ksu-notify-ready'
      });
    }catch(e){}
  }else if(b){
    b.textContent='Aktiver varsling';
  }
}
async function notifyAircraft(p){
  if(!p || !('Notification' in window) || Notification.permission!=='granted')return;
  const name=p.flight||p.reg||p.hex||'Fly';
  const body=`${fNm(p.d)} · ${f(p.alt,' ft')}${specialService(p)?' · '+specialService(p):''}`;
  try{
    const reg=await navigator.serviceWorker.ready;
    await reg.showNotification('Fly innen 50 NM: '+name,{
      body,
      tag:'ksu-50-'+(p.hex||name),
      renotify:false
    });
  }catch(e){}
}
function check50NmNotifications(list){
  const inside=list.filter(p=>nm(p.d)<=50);
  const current=new Set(inside.map(p=>p.hex||p.flight||p.reg).filter(Boolean));
  if(!notificationBaselineReady){
    notified50=new Set(current);
    notificationBaselineReady=true;
    return;
  }
  inside.forEach(p=>{
    const key=p.hex||p.flight||p.reg;
    if(key && !notified50.has(key))notifyAircraft(p);
  });
  notified50=current;
}
async function refresh(){
  let s=settings();save();
  $('status').textContent='Henter…';$('status').className='muted';
  home.setLatLng([s.lat,s.lon]);
  updateRangeRings(s);
  try{
    let merged=[], workerOk=false, sharedTracks=null;
    try{
      const wr=await fetch(WORKER_URL,{cache:'no-store',credentials:'omit'});
      if(!wr.ok)throw new Error('Worker HTTP '+wr.status);
      const w=await wr.json();
      if(!w||w.ok!==true||!Array.isArray(w.ac))throw new Error('Ugyldig Worker-svar');
      merged=w.ac;
      sharedTracks=w.tracks||null;
      sourceState.adsb=w.sources?.['adsb.lol']?.ok?'OK':'feil';
      sourceState.apl=w.sources?.['airplanes.live']?.ok?'OK':'feil';
      sourceState.fi=w.sources?.['adsb.fi']?.ok?'OK':'feil';
      workerOk=true;
    }catch(workerError){
      const adsbUrl=`https://api.adsb.lol/v2/point/${s.lat}/${s.lon}/${s.r}`;
      const aplUrl=`https://api.airplanes.live/v2/point/${s.lat}/${s.lon}/${s.r}`;
      const [adsbRes,aplRes]=await Promise.allSettled([fetchJson(adsbUrl),fetchJson(aplUrl)]);
      sourceState.adsb=adsbRes.status==='fulfilled'?'OK':'feil';
      sourceState.apl=aplRes.status==='fulfilled'?'OK':'feil';
      const adsbData=adsbRes.status==='fulfilled'?(adsbRes.value.ac||[]):[];
      const aplData=aplRes.status==='fulfilled'?(aplRes.value.ac||[]):[];
      const anySourceOk=adsbRes.status==='fulfilled'||aplRes.status==='fulfilled';
      if(!anySourceOk)throw workerError;
      merged=mergeAircraft(adsbData,aplData);
    }

    localPlanes=merged
      .filter(a=>a.lat!=null&&a.lon!=null)
      .map(a=>normalize(a,s))
      .filter(p=>nm(p.d)<=150)
      .sort((a,b)=>a.d-b.d);

    planes=retainRecentPlanes(mergeTrackedPlanes(localPlanes,remoteKsuPlanes));
    attachAvinorMatches();
    lastGoodPlanes=planes.map(p=>({...p}));
    if(!ingestSharedTracks(sharedTracks))updateTrackHistory(planes);
    check50NmNotifications(planes);
    const localCount=planes.filter(localRelevant).length;
    const priority=priorityKsuAircraft(planes);
    const passerby=!priority?priorityPasserby(planes):null;
    const followed=priority||passerby||planes.filter(localRelevant).sort((a,b)=>a.d-b.d)[0];
    const followText=followed?' · følger '+(priority?'KSU ':passerby?'lokalt ':'')+(followed.flight||followed.reg||followed.hex):'';
    $('status').textContent=`${localCount} fly i området${followText} · ${new Date().toLocaleTimeString('no-NO',{hour:'2-digit',minute:'2-digit'})}`;
    $('status').className='ok';
    document.body.dataset.liveSource=workerOk?'worker':'direct-fallback';
    render(true);
    if(selected)enrichRoute(selected);
    loadAvinor();
  }catch(e){
    if(lastGoodPlanes.length){
      planes=lastGoodPlanes.map(p=>({...p}));
      const localCount=planes.filter(localRelevant).length;
      $('status').textContent=`${localCount} fly i området · viser sist kjente data`;
      $('status').className='muted';
      render(false);
      loadAvinor();
      return;
    }
    $('status').textContent='Feil: '+e.message;$('status').className='err';
    $('cards').innerHTML='<div class="card">Kunne ikke hente live-data. Kontroller nettverk eller prøv Oppdater igjen.</div>';
  }
}
function airportCoords(a){
  if(!a)return null;
  const lat=+(a.lat??a.latitude??a.position?.lat);
  const lon=+(a.lon??a.lng??a.longitude??a.position?.lon??a.position?.lng);
  return Number.isFinite(lat)&&Number.isFinite(lon)?[lat,lon]:null;
}
function drawRoute(p){
  routeLayer.clearLayers();
  if(!p)return;
  const r=p.routeData;
  const aps=Array.isArray(r?._airports)?r._airports:[];
  if(aps.length<2)return;

  const from=airportCoords(aps[0]);
  const to=airportCoords(aps[aps.length-1]);
  const plane=[p.lat,p.lon];

  if(from){
    const a=aps[0];
    const code=a.iata||a.icao||a.code||'APT';
    const place=a.city||a.name||'Avgangsflyplass';
    L.polyline([from,plane],{weight:2,opacity:.65,dashArray:'6 8'}).addTo(routeLayer);
    L.marker(from,{
      icon:airportIcon(code,place,'departure'),
      zIndexOffset:700
    }).bindTooltip('Fra: '+airportLabel(a),{direction:'top'}).addTo(routeLayer);
  }
  if(to){
    const a=aps[aps.length-1];
    const code=a.iata||a.icao||a.code||'APT';
    const place=a.city||a.name||'Ankomstflyplass';
    L.polyline([plane,to],{weight:3,opacity:.9}).addTo(routeLayer);
    L.marker(to,{
      icon:airportIcon(code,place,'arrival'),
      zIndexOffset:750
    }).bindTooltip('Til: '+airportLabel(a),{direction:'top'}).addTo(routeLayer);
  }
}
function select(p,lookupRoute=true){
  if(!p)return;
  selected=p;
  if(lookupRoute && p.flight && !p.routeData && !routeCache.has(p.flight.trim())) setTimeout(()=>enrichRoute(p),0);
  drawRoute(p);
  drawTrackAndPrediction(p);
  $('hcall').textContent=p.flight||p.reg||p.hex||'Ukjent';
  $('hmeta').textContent=[p.operator,p.reg,p.type,p.desc].filter(Boolean).join(' · ')||p.hex;
  $('hroute').textContent=displayRoute(p);
  $('hdist').textContent=fNm(p.d);
  $('halt').textContent=f(p.alt,' ft');
  $('hspd').textContent=f(p.gs,' kt');
  $('htrk').textContent=f(p.track,'°');
  $('hvr').textContent=f(p.vr,' ft/min');
}
function render(autoFit=false){
  const s=settings();
  let q=($('filter')?.value||'').toLowerCase();
  let list=planes.filter(p=>!q||[p.flight,p.reg,p.type,p.hex,p.operator,p.desc,p.route].join(' ').toLowerCase().includes(q));
  const nearCount=list.filter(localRelevant).length;
  const closestText=list[0]?fNm(list[0].d):'–';
  const updatedText=new Date().toLocaleTimeString('no-NO');
  $('count').textContent=nearCount;
  $('closest').textContent=closestText;
  $('updated').textContent=updatedText;
  if($('fs-count'))$('fs-count').textContent=nearCount;
  if($('fs-closest'))$('fs-closest').textContent=closestText;
  if($('fs-updated'))$('fs-updated').textContent=updatedText;
  if($('fs-status'))$('fs-status').textContent=$('status')?.textContent||'';
  if($('fs-aircraft')){
    const p=list[0]||null;
    $('fs-aircraft').innerHTML=p
      ? `<b>${p.flight||p.reg||p.hex||'Ukjent'} · ${fNm(p.d)}</b><span>${[p.reg,p.type,ksuFlightInfo(p)?.route||displayRoute(p),ksuOperationalStatus(p),f(p.alt,' ft'),f(p.gs,' kt')].filter(Boolean).join(' · ')}</span>`
      : '<b>Ingen fly</b><span>–</span>';
  }
  const priority=priorityKsuAircraft(list);
  const passerby=!priority?priorityPasserby(list):null;
  if(priority && (!selected || ksuPriorityScore(priority)>ksuPriorityScore(selected)))selected=priority;
  else if(passerby && (!selected || !selected.ksuFlight))selected=passerby;
  layer.clearLayers();
  list.forEach(p=>{
    L.marker([p.lat,p.lon],{icon:planeIcon(p)})
      .bindTooltip(`${p.ksuFlight?'KSU · ':observablePasserby(p)?'SE/HØR · ':localRelevant(p)?'NÆR · ':''}${p.flight||p.reg||p.hex} · ${fNm(p.d)}${p.remoteTracked?' · fjernsporing':''}${p.signalLost?' · SIGNAL MISTET':''}`,{direction:'top',offset:[0,-15]})
      .on('click',()=>{select(p);render(false)})
      .addTo(layer);
  });
  const nearest=list[0]||null;
  const current=selected&&list.find(p=>p.hex===selected.hex);
  const shown=current||nearest;
  if(shown){
    selected=shown;
    const localCountNow=list.filter(localRelevant).length;
    const activePrefix=shown.ksuFlight?'KSU ':observablePasserby(shown)?'lokalt ':'';
    $('status').textContent=`${localCountNow} fly i området · følger ${activePrefix}${shown.flight||shown.reg||shown.hex} · ${new Date().toLocaleTimeString('no-NO',{hour:'2-digit',minute:'2-digit'})}`;
    $('status').className='ok';
    const rp=routeCardParts(shown);
    const service=specialService(shown);
    const ksuInfo=ksuFlightInfo(shown);
    const hasConfirmedRoute=Boolean(ksuInfo||rp);
    const inferred=hasConfirmedRoute?null:inferredRouteLabel(shown);
    const routeBlock=ksuInfo
      ? `<div class="flight-route">
          <div class="route-end"><b>${ksuInfo.direction==='Ankomst KSU'?(shown.ksuFlight?.airport||'–'):'KSU'}</b><span>${ksuInfo.direction==='Ankomst KSU'?'Avgang':'Kristiansund'}</span></div>
          <div class="route-arrow"><span>✈</span><i></i></div>
          <div class="route-end"><b>${ksuInfo.direction==='Ankomst KSU'?'KSU':(shown.ksuFlight?.airport||'–')}</b><span>${ksuInfo.direction==='Ankomst KSU'?'Kristiansund':'Destinasjon'}</span></div>
        </div>`
      : rp
        ? `<div class="flight-route">
            <div class="route-end"><b>${rp.fromCode}</b><span>${rp.fromPlace}</span></div>
            <div class="route-arrow"><span>✈</span><i></i></div>
            <div class="route-end"><b>${rp.toCode}</b><span>${rp.toPlace}</span></div>
          </div>`
        : inferred
          ? `<div class="flight-route fallback inferred"><div class="route-loading">${inferred.label} · ${inferred.name}</div></div>`
          : `<div class="flight-route fallback"><div class="route-loading">${displayRoute(shown)}</div></div>`;
    $('cards').innerHTML=`<div class="card aircraft-card ${localRelevant(shown)?'local-card':''}">
      <div class="aircraft-head">
        <div>
          <div class="aircraft-title">
            <span class="call">${shown.flight||shown.reg||shown.hex||'Ukjent'}</span>
            ${shown.type?`<span class="type-pill">${shown.type}</span>`:''}
          </div>
          <div class="operator">${shown.operator||service||shown.desc||''}</div>
        </div>
        <div class="dist">${fNm(shown.d)}</div>
      </div>
      ${ksuInfo?`<div class="ksu-flight"><b>${ksuInfo.direction}</b><span>${ksuInfo.route} · planlagt ${ksuInfo.time}${ksuInfo.status?' · '+ksuInfo.status:''}</span></div>`:''}
      ${routeBlock}
      <div class="aircraft-metrics">
        <div><span>HØYDE</span><b>${f(shown.alt,' ft')}</b></div>
        <div><span>FART</span><b>${f(shown.gs,' kt')}</b></div>
        <div><span>KURS</span><b>${f(shown.track,'°')}</b></div>
        <div><span>VERT.</span><b>${f(shown.vr,' ft/min')}</b></div>
      </div>
      <div class="aircraft-foot">
        <span>${shown.desc||shown.type||'Fly'}</span>
        <span>${shown.reg?('REG. '+shown.reg):''}</span>
      </div>
      <div class="movement-status ${shown.ksuFlight?'ksu':inferred?'inferred':''}">${shown.signalLost?signalStateText(shown):(shown.ksuFlight?ksuOperationalStatus(shown):(inferred?`Sannsynlig mot ${inferred.code}`:ksuOperationalStatus(shown)))}</div>
      ${visibilityHint(shown)?`<div class="movement-status">${visibilityHint(shown)}</div>`:''}
      <div class="movement">${shown.signalLost?(signalStateText(shown).startsWith('Parkert')?'Siste kjente posisjon ved flyplass':signalStateText(shown).startsWith('Landet')?'Siste kjente posisjon etter landing':'Viser siste kjente posisjon'):movementText(shown)}</div>
      <div class="source">${shown.source||''}</div>
    </div>`;
    select(shown,false);
  }else{
    selected=null;
    $('status').textContent=`0 fly i området · ${new Date().toLocaleTimeString('no-NO',{hour:'2-digit',minute:'2-digit'})}`;
    $('status').className='ok';
    $('cards').innerHTML='';
    routeLayer.clearLayers();
  }
  if(autoFit) fitMap(list,s);
}
function toggleDisplay(){
  display=!display;
  document.body.classList.toggle('display-on',display);
  $('hero').classList.toggle('on',display);
  $('map').classList.toggle('hidden',display);
  $('cards').classList.toggle('hidden',display);
  $('stats').classList.toggle('hidden',display);
  $('mode').textContent=display?'Tilbake':'Displaymodus';
  if(display && selected)select(selected);
  if(!display)setTimeout(()=>map.invalidateSize(),50);
}
if($('refresh'))$('refresh').onclick=refresh;
if($('filter'))$('filter').oninput=()=>render(false);
if($('radius'))$('radius').onchange=()=>{save();applyMapLevel(settings());refresh();};
if($('area'))$('area').onchange=()=>{save();applyMapLevel(settings());};
if($('save'))$('save').onclick=refresh;
if($('mode'))$('mode').onclick=toggleDisplay;
if($('notify'))$('notify').onclick=requestNotifications;
let refreshTimer=null;
function nextRefreshMs(){
  if(!planes.length)return 120000;

  // Fly som er lave og nær en kjent flyplass skal oppdateres raskt,
  // selv om flyplassen ligger langt fra KSU.
  for(const p of planes){
    const near=nearestKnownAirport(p,8);
    if(!near)continue;
    const alt=Number(p.alt);
    const gs=Number(p.gs);
    const hasAlt=Number.isFinite(alt);

    // Bekreftede KSU-fly på/tett ved avgangsflyplass skal følges tett selv
    // når ADS-B ikke rapporterer høyde på bakken.
    if(p.ksuFlight){
      if(near.dNm<=1.5 && (!Number.isFinite(gs)||gs<=45) && (!hasAlt||alt<=2500))return 3000;
      if(near.dNm<=3 && (!Number.isFinite(gs)||gs<=120) && (!hasAlt||alt<=4000))return 5000;
      if(near.dNm<=6 && (!Number.isFinite(gs)||gs<=220) && (!hasAlt||alt<=8000))return 10000;
    }

    // Samme raske bakke-/taxiregel for alle fly ved kjente flyplasser.
    // Høyde er ikke nødvendig når lav fart og nærhet tydelig viser bakke/taxi.
    if(near.dNm<=1.5 && Number.isFinite(gs) && gs<=45 && (!hasAlt||alt<=2500))return 3000;
    if(near.dNm<=3 && Number.isFinite(gs) && gs<=120 && (!hasAlt||alt<=4000))return 5000;

    if(near.dNm<=1.5 && hasAlt && alt<=2000)return 3000;
    if(near.dNm<=3 && hasAlt && alt<=3000)return 5000;
    if(near.dNm<=6 && hasAlt && alt<=6000)return 10000;
    if(near.dNm<=8 && hasAlt && alt<=10000 && (!Number.isFinite(gs)||gs<=250))return 20000;
  }

  const nearest=planes.slice().sort((a,b)=>a.d-b.d)[0];
  if(!nearest)return 120000;
  const dNm=nm(nearest.d);
  const alt=typeof nearest.alt==='number'?nearest.alt:99999;
  if(dNm<=5)return 10000;
  if(dNm<=15)return 15000;
  if(dNm<=30 && alt<=20000)return 30000;
  if(dNm<=75)return 60000;
  return 120000;
}
async function adaptiveRefresh(){
  if(refreshTimer)clearTimeout(refreshTimer);
  await refresh();
  refreshTimer=setTimeout(adaptiveRefresh,nextRefreshMs());
}
load();loadOffshore();adaptiveRefresh();setInterval(loadAvinor,600000);
setInterval(()=>{
  if(document.hidden)return;
  const sorted=planes.slice().sort((a,b)=>a.d-b.d);
  const priority=priorityKsuAircraft(sorted);
  if(priority)return;
  const passerby=priorityPasserby(sorted);
  if(passerby)return;
  const nearest=sorted[0];
  if(nearest && nm(nearest.d)>50)focusIdleCandidate(sorted,true);
},20000);
if('serviceWorker' in navigator){navigator.serviceWorker.register('./sw.js').catch(()=>{});}
