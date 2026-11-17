const $=x=>document.getElementById(x);
let planes=[], localPlanes=[], remoteKsuPlanes=[], vessels=[], display=false, selected=null, avinorFlights=[], lastGoodPlanes=[], sourceState={adsb:'ukjent',apl:'ukjent',fi:'ukjent'};
let idleFocusIndex=0;
const trackHistory=new Map();
const routeCache=new Map();
const routeAttempts=new Map();
const routeRequests=new Set();
const aircraftRouteCache=new Map();
const recentPlaneCache=new Map();
const remoteKsuIdentityCache=new Map();
const ksuLastKnownCache=new Map();
const liveDistanceState=new Map();
const LOST_SIGNAL_KEEP_MS=3*60*1000;
const KSU_LOST_SIGNAL_KEEP_MS=60*1000;
let notified50=new Set(), notificationBaselineReady=false;
const WORKER_URL='https://flyradar-ksu.vidar-skoglund.workers.dev/aircraft';
const mapAreas={
  airport:{label:'Kvernberget',lat:63.1118,lon:7.8245},
  city:{label:'Kristiansund sentrum',lat:63.1103,lon:7.7279}
};
let map=L.map('map',{zoomControl:true}).setView([63.1118,7.8245],7);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18}).addTo(map);
let layer=L.layerGroup().addTo(map);
const motionMarkers=new Map();
map.createPane('rangePane');
map.getPane('rangePane').style.zIndex='560';
map.getPane('rangePane').style.pointerEvents='none';
let rangeLayer=L.layerGroup().addTo(map);
let offshoreLayer=L.layerGroup().addTo(map);
let routeLayer=L.layerGroup().addTo(map);
let trackLayer=L.layerGroup().addTo(map);
let airportLayer=L.layerGroup().addTo(map);
let vesselLayer=L.layerGroup().addTo(map);

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
    if(zoom<8 && !a.major)return;
    if(zoom<7)return;
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
  const compact=zoom>=11 || window.innerWidth<=600;
  home.setIcon(airportIcon('KSU','Kvernberget','home',compact));
}
map.on('zoomend',()=>{document.getElementById('map').classList.toggle('wide-map',map.getZoom()<9);try{updateRangeRings(settings());renderNorwayAirports();updateHomeAirportMarker()}catch(e){}});
renderNorwayAirports();
updateHomeAirportMarker();
document.getElementById('map').classList.toggle('wide-map',map.getZoom()<9);

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
function local25Traffic(p){
  return Boolean(p && !p.signalLost && !p.ksuFlight && nm(p.d)<=25);
}
function queueLocal25RouteLookups(list){
  const candidates=list
    .filter(p=>local25Traffic(p)&&p.flight&&!specialService(p)&&!p.routeData&&canLookupRoute(p))
    .sort((a,b)=>a.d-b.d)
    .slice(0,2);
  candidates.forEach((p,i)=>setTimeout(()=>enrichRoute(p),i*700));
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
function ksuContinuityKey(f){
  if(!f)return '';
  return [compactFlightId(f.flight_id),f.arr_dep||'',f.airport||''].join('|');
}
function preserveKsuLastKnown(list){
  const now=Date.now();
  const out=[...list];
  const represented=new Set();

  for(const p of out){
    if(!p?.ksuFlight)continue;
    const key=ksuContinuityKey(p.ksuFlight);
    if(!key)continue;
    represented.add(key);
    if(!p.signalLost && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lon))){
      ksuLastKnownCache.set(key,{
        plane:{...p,signalLost:false,lastSeenAt:now},
        lastSeenAt:now
      });
    }
  }

  for(const [key,entry] of ksuLastKnownCache){
    const age=now-entry.lastSeenAt;
    if(age>KSU_LOST_SIGNAL_KEEP_MS){
      ksuLastKnownCache.delete(key);
      continue;
    }
    if(represented.has(key))continue;
    out.push({
      ...entry.plane,
      signalLost:true,
      lastSeenAt:entry.lastSeenAt,
      _ksuLastKnown:true
    });
  }

  return out.sort((a,b)=>a.d-b.d);
}
function ksuParkedState(p){
  if(!p?.ksuFlight||!confirmedKsuArrival(p))return null;
  const ksu=airportByCode('KSU');
  const dNm=nm(dist(ksu.lat,ksu.lon,p.lat,p.lon));
  if(dNm>3.5)return null;

  const gs=Number(p.gs);
  const alt=Number(p.alt);
  const groundLike=
    String(p.alt||'').toLowerCase()==='ground' ||
    (Number.isFinite(gs)&&gs<=25&&(!Number.isFinite(alt)||alt<=1500));

  if(!groundLike)return null;

  const ageSec=p.signalLost
    ? Math.max(0,Math.round((Date.now()-(p.lastSeenAt||Date.now()))/1000))
    : 0;

  if(p.signalLost&&ageSec>=60)return {label:'Parkert ved KSU',ageSec};
  return {label:'På bakken ved KSU',ageSec};
}

function signalStateText(p){
  if(!p?.signalLost)return '';
  const ageSec=Math.max(0,Math.round((Date.now()-(p.lastSeenAt||Date.now()))/1000));
  const parked=ksuParkedState(p);
  if(parked)return parked.label;
  if(p.ksuFlight)return `Signal midlertidig mistet · siste kjente posisjon · sist sett ${ageSec<60?ageSec+' sek':Math.round(ageSec/60)+' min'} siden`;
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
      if(status==='C')return false;
      const t=Date.parse(f.schedule_time||'');
      if(!Number.isFinite(t))return false;
      // Avinor kan markere "Landet" før ADS-B-sporingen er ferdig.
      // Behold ankomsten i fjernsporing en kort stund etter planlagt/ny tid.
      if(status==='A')return t>=now-45*60*1000&&t<=now+20*60*1000;
      return t>=now-25*60*1000&&t<=now+120*60*1000;
    })
    .sort((a,b)=>Date.parse(a.schedule_time)-Date.parse(b.schedule_time))
    .slice(0,4);
}
function remoteDepartureCandidates(){
  const now=Date.now();
  return avinorFlights
    .filter(f=>{
      if(f.arr_dep!=='D')return false;
      const status=String(f.status_code||'').toUpperCase();
      if(status==='C')return false;
      const t=Date.parse(f.schedule_time||'');
      if(!Number.isFinite(t))return false;
      return t>=now-40*60*1000&&t<=now+90*60*1000;
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
      const found=rows.find(a=>compactFlightId(a.flight)===compactFlightId(callsign))||null;
      if(found)return found;
    }catch(e){}
  }
  return null;
}
async function routeForCallsign(callsign,lat,lon,alt=null,faScope=''){
  const key=String(callsign||'').trim();
  if(!key)return null;
  try{
    const u=new URL('https://flyradar-ksu.vidar-skoglund.workers.dev/route');
    u.searchParams.set('callsign',key);
    if(Number.isFinite(Number(lat)))u.searchParams.set('lat',lat);
    if(Number.isFinite(Number(lon)))u.searchParams.set('lon',lon);
    if(Number.isFinite(Number(alt)))u.searchParams.set('alt',Number(alt));
    if(faScope)u.searchParams.set('fa_scope',faScope);
    const r=await fetch(u,{cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(12000)});
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
async function discoverKsuDepartureAircraft(f){
  const destination=airportByCode(f?.airport);
  const ksu=airportByCode('KSU');
  if(!destination||!ksu)return null;
  try{
    const url=`https://api.airplanes.live/v2/point/${ksu.lat}/${ksu.lon}/25`;
    const j=await fetchJson(url);
    const rows=(Array.isArray(j?.ac)?j.ac:[]).filter(a=>{
      const cs=compactFlightId(a.flight);
      if(!cs)return false;
      if(/^WF/.test(compactFlightId(f.flight_id||'')))return cs.startsWith('WIF');
      if(/^SK/.test(compactFlightId(f.flight_id||'')))return cs.startsWith('SAS');
      return true;
    }).slice(0,8);

    for(const a of rows){
      const callsign=String(a.flight||'').trim();
      const route=await routeForCallsign(callsign,a.lat,a.lon);
      if(routeContainsAirport(route,'KSU')&&routeContainsAirport(route,destination.code)){
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
  const candidates=[
    ...remoteArrivalCandidates(),
    ...remoteDepartureCandidates()
  ].sort((a,b)=>Date.parse(a.schedule_time||'')-Date.parse(b.schedule_time||''))
   .slice(0,6);

  for(let i=0;i<candidates.length;i++){
    const f=candidates[i];
    const flightKey=avinorFlightKey(f);
    const scheduledCallsign=trackingCallsign(f.flight_id);
    const cachedIdentity=remoteKsuIdentityCache.get(flightKey)||null;

    let raw=null;

    // Når vi først har funnet det operative ADS-B-callsignet for en Avinor-
    // flyging, bruk samme identitet videre hele veien mot KSU.
    if(cachedIdentity?.callsign){
      raw=await fetchRemoteCallsign(cachedIdentity.callsign);
    }

    if(!raw){
      raw=await fetchRemoteCallsign(scheduledCallsign);
    }

    if(!raw){
      raw=f.arr_dep==='D'
        ? await discoverKsuDepartureAircraft(f)
        : await discoverKsuAircraftFromDeparture(f);
    }

    if(raw&&raw.lat!=null&&raw.lon!=null){
      const actualCallsign=String(raw.flight||'').trim();
      if(actualCallsign){
        remoteKsuIdentityCache.set(flightKey,{
          callsign:actualCallsign,
          hex:String(raw.hex||'').trim().toLowerCase(),
          updatedAt:Date.now()
        });
      }

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

  // Fjern gamle identitetskoblinger etter noen timer.
  const activeKeys=new Set(candidates.map(avinorFlightKey));
  for(const [key,entry] of remoteKsuIdentityCache){
    if(!activeKeys.has(key) && Date.now()-(entry.updatedAt||0)>3*60*60*1000){
      remoteKsuIdentityCache.delete(key);
    }
  }

  remoteKsuPlanes=found;
  planes=retainRecentPlanes(mergeTrackedPlanes(localPlanes,remoteKsuPlanes));
  attachAvinorMatches();
  planes=preserveKsuLastKnown(planes);
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
  const ksu=airportByCode('KSU');
  const dNm=nm(dist(p.lat,p.lon,ksu.lat,ksu.lon));

  // Lokal-first: automatisk flyplasszoom er kun tillatt ved Kvernberget.
  // Andre flyplasser kan fortsatt vises i ruten, men skal aldri overta kartet.
  if(dNm<=6 && (
    String(altRaw||'').toLowerCase()==='ground' ||
    (Number.isFinite(gs)&&gs<=60&&dNm<=3.5) ||
    (Number.isFinite(alt)&&alt<=2500&&Number.isFinite(gs)&&gs<=80&&dNm<=2)
  )){
    return {airport:ksu,dNm,mode:'ground',label:'På bakken ved KSU'};
  }

  if(Number.isFinite(alt)&&alt<=3000 &&
     Number.isFinite(gs)&&gs<=200&&dNm<=5.5){
    return {airport:ksu,dNm,mode:'approach',label:'Nær KSU · lav høyde'};
  }

  const info=ksuFlightInfo(p);
  const headingToKsu=getTrackDeg(p);
  const toKsu=bearingBetween(p.lat,p.lon,ksu.lat,ksu.lon);
  const toward=headingToKsu!==null&&angleDiff(headingToKsu,toKsu)<=55;
  const descending=Number.isFinite(vr)&&vr<-100;
  const low=Number.isFinite(alt)&&alt<=7000;

  if(info?.direction==='Ankomst KSU' && dNm<=12 && (descending||low) && toward){
    return {airport:ksu,dNm,mode:'approach',label:'Innflyging mot KSU'};
  }
  return null;
}
function focusAirportArrival(p,ctx){
  if(!p||!ctx)return false;
  const airportPos=[ctx.airport.lat,ctx.airport.lon];
  const planePos=[p.lat,p.lon];

  if(ctx.mode==='ground'){
    // Omtrent samme utsnitt som manuelt nærzoom på HOV/TRD.
    if(map.getZoom()<15 || !map.getBounds().pad(-0.25).contains(planePos)){
      if(confirmedKsuArrival(p))map.setView(planePos,15); else fitWithKristiansund(p,[planePos,airportPos],{padding:[70,70],maxZoom:13});
    }
  }else{
    let zoom=11;
    if(ctx.dNm<=8)zoom=12;
    if(ctx.dNm<=5)zoom=13;
    if(ctx.dNm<=2.5)zoom=14;
    if(ctx.dNm<=1)zoom=15;
    fitWithKristiansund(p,[airportPos,planePos],{padding:[70,70],maxZoom:zoom});
    if(map.getZoom()<Math.min(zoom,12))map.setZoom(Math.min(zoom,12));
  }

  selected=p;
  select(p,false);
  if($('fs-status'))$('fs-status').textContent=ctx.label+' · '+(p.flight||p.reg||p.hex);
  return true;
}

function remoteKsuDepartureContext(p){
  const info=ksuFlightInfo(p);
  const f=p?.ksuFlight;
  if(!info||!f||info.direction!=='Ankomst KSU'||info.status==='Innstilt')return null;

  const origin=airportByCode(f.airport);
  if(!origin||origin.code==='KSU')return null;

  const dNm=nm(dist(origin.lat,origin.lon,p.lat,p.lon));
  if(dNm>6)return null;

  const altRaw=p.alt;
  const alt=Number(altRaw);
  const gs=Number(p.gs);
  const onGround=String(altRaw||'').toLowerCase()==='ground' ||
    (!Number.isFinite(alt) && (!Number.isFinite(gs)||gs<=90)) ||
    (Number.isFinite(alt)&&alt<=1500&&(!Number.isFinite(gs)||gs<=120));

  const takeoffRoll=Number.isFinite(gs)&&gs>90&&gs<=190&&
    (!Number.isFinite(alt)||alt<=1800)&&dNm<=3.5;

  if(!onGround&&!takeoffRoll)return null;

  return {
    airport:origin,
    dNm,
    mode:takeoffRoll?'takeoff':'ground',
    label:takeoffRoll?('Tar av fra '+origin.code):('Klar for avgang fra '+origin.code)
  };
}
function focusRemoteKsuDeparture(p,ctx){
  if(!p||!ctx)return false;
  const airportPos=[ctx.airport.lat,ctx.airport.lon];
  const planePos=[p.lat,p.lon];

  let zoom=14;
  if(ctx.dNm<=2.5)zoom=15;
  if(ctx.mode==='takeoff')zoom=14;

  const points=[airportPos,planePos];
  if(map.getZoom()<zoom || !points.every(pos=>map.getBounds().pad(-0.18).contains(pos))){
    map.fitBounds(L.latLngBounds(points),{padding:[70,70],maxZoom:zoom});
    if(map.getZoom()<13)map.setZoom(13);
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

  const airport=airportByCode('KSU');
  const d=nm(dist(airport.lat,airport.lon,p.lat,p.lon));
  if(d>6)return null;

  return {
    airport,
    label:info.direction==='Ankomst KSU'
      ? 'På bakken ved KSU etter ankomst'
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
    if(info.status==='Landet'){
      const nearKsu=d<=5;
      const gs=Number(p.gs);
      const alt=Number(p.alt);
      const physicallyDown=nearKsu &&
        ((!Number.isFinite(gs)||gs<=80) &&
         (!Number.isFinite(alt)||alt<=2500));
      if(physicallyDown){
        const parked=ksuParkedState(p);
        if(parked?.label==='Parkert ved KSU')return 720;
        return 1080;
      }
      // Avinor-status alene skal ikke få oss til å slippe et fly som fortsatt
      // er i lufta eller fortsatt sender på innflygingen.
    }
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

function settings(){return {lat:63.1118,lon:7.8245,r:75,area:'airport'}}
function normalize(a,s){
  let lat=a.lat,lon=a.lon;
  const flight=(a.flight||'').trim();
  const previous=recentPlaneCache.get(planeKey({hex:a.hex,reg:a.r,flight:a.flight}))?.plane;
  const sameFix=previous && previous.lat===lat && previous.lon===lon;

  // Behold kjent rute gjennom nye ADS-B-posisjonsobjekter.
  // Uten dette veksler kortet mellom "Henter rute…" og den bekreftede ruten.
  const cachedRoute=(flight&&routeCache.has(flight)?routeCache.get(flight):null) || cachedAircraftRoute({
    hex:a.hex,reg:a.r,flight
  });
  const routeData=previous?.routeData||cachedRoute||null;
  const route=routeData?routeText(routeData):(previous?.route||null);

  return{
    hex:a.hex||'',flight,reg:a.r||'',type:a.t||'',
    operator:a.ownOp||a.operator||'',desc:a.desc||'',lat,lon,
    alt:Number.isFinite(Number(a.alt_baro??a.alt_geom))?Number(a.alt_baro??a.alt_geom):a.alt_baro??a.alt_geom,gs:Number.isFinite(Number(a.gs))?Number(a.gs):a.gs,track:Number.isFinite(Number(a.track??a.true_heading??a.mag_heading))?Number(a.track??a.true_heading??a.mag_heading):a.track??a.true_heading??a.mag_heading,
    vr:a.baro_rate??a.geom_rate,d:dist(s.lat,s.lon,lat,lon),route,routeData,source:a._source||'Kombinerte data (Worker)',
    positionAt:sameFix?previous.positionAt:Date.now()
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
function isHelicopter(p){
  const type=String(p?.type||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
  const desc=String(p?.desc||'').toLowerCase();
  const operator=String(p?.operator||'').toLowerCase();
  // Known ICAO helicopter types. Avoid classifying solely by operator,
  // since offshore and rescue operators can also operate fixed-wing aircraft.
  const types=new Set(['S92','S76','EC35','EC45','EC55','EC75','EC20','EC25','EC30','EC50','EC15','EC65','AS32','AS35','AS50','AS55','AS65','H145','H135','H125','H160','H175','AW09','AW10','AW11','AW13','AW16','AW18','A109','A119','A139','A169','A189','B06','B206','B212','B222','B407','B412','B429','B505','R22','R44','R66','MD52','MD60','MD90','NH90','MI8','MI17','MI24','MI26','UH60','H60','H47','CH47','H500','H369','H269','CABR','G2CA']);
  return types.has(type) || /helicopter|helikopter|rotorcraft/.test(desc) ||
    (/^HK[SM]/i.test(String(p?.flight||'')) && /helicopter|helikopter|offshore|chc/.test(operator+' '+desc));
}
function planeIcon(p){
  const tr=getTrackDeg(p)??0;
  const heli=isHelicopter(p);
  const shape=heli
    ? '<path d="M14 2 H18 V11 H25 V13 H18 V15 H21 L24 18 V21 L20 20 L18 26 H23 V28 H9 V26 H14 L12 20 L8 21 V18 L11 15 H14 V13 H7 V11 H14 Z"/><path d="M4 12 H28 M16 2 V6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>'
    : '<path d="M16 1.5 L18.8 11.2 L29 15.2 L29 18.1 L18.6 16.7 L18 25.2 L22.1 28.5 L22.1 30 L16 28.3 L9.9 30 L9.9 28.5 L14 25.2 L13.4 16.7 L3 18.1 L3 15.2 L13.2 11.2 Z"/>';
  return L.divIcon({
    className:'plane-wrap',
    html:`<div class="plane-marker ${heli?'helicopter':''} ${localRelevant(p)?'local':''} ${p.signalLost&&p.ksuFlight?'ksu-stale':''}" style="transform:rotate(${tr}deg)" title="${heli?'Helikopter':'Fly'}">
      <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">${shape}</svg>
    </div>`,
    iconSize:[34,34],iconAnchor:[17,17]
  });
}
function planeKey(p){return String(p.hex||p.reg||p.flight||'').trim().toLowerCase()}
function routeIdentityKeys(p){
  return [
    p?.hex?String(p.hex).trim().toLowerCase():'',
    p?.reg?String(p.reg).trim().toLowerCase():'',
    p?.flight?String(p.flight).trim().toLowerCase():''
  ].filter(Boolean);
}
function cachedAircraftRoute(p){
  for(const key of routeIdentityKeys(p)){
    if(aircraftRouteCache.has(key))return aircraftRouteCache.get(key);
  }
  return null;
}
function rememberAircraftRoute(p,r){
  if(!r)return;
  for(const key of routeIdentityKeys(p))aircraftRouteCache.set(key,r);
}

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
  const rings=[25,50];

  rings.forEach(n=>{
    const isAlert=n===50;
    const isLookup=n===25;
    L.circle([s.lat,s.lon],{
      radius:n*1852,
      color:isAlert?'#ff5c5c':isLookup?'#ffd166':'#6b8198',
      weight:isAlert?2.2:1.6,
      opacity:isAlert?0.82:0.72,
      fill:false,
      dashArray:isAlert?'7 8':'4 7',
      interactive:false,
      pane:'rangePane'
    }).addTo(rangeLayer);

    const pos=destinationPoint(s.lat,s.lon,n,0);
    const label=isAlert?'50 NM':'25 NM · MER INFO';
    L.marker(pos,{interactive:false,pane:'rangePane',icon:L.divIcon({
      className:'range-label-wrap',
      html:`<div class="range-label ${isAlert?'alert-zone':'lookup-zone'}">${label}</div>`,
      iconSize:[126,22],iconAnchor:[63,11]
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
let idleViewStartedAt=null, idleViewPhase=-1, manualMapUntil=0;
function idleViewPlan(elapsedMs){
  const seconds=(elapsedMs/1000)%60;
  if(seconds<32)return {phase:0,radius:35};
  if(seconds<54)return {phase:1,radius:45};
  return {phase:2,radius:60}; // Only six seconds of wider overview.
}
function hasMapTraffic(list){
  return list.some(p=>!p.signalLost && (ksuDistanceNm(p)<=50 || confirmedKsuArrival(p)));
}
function focusIdleCandidate(list,advance=false){
  if(hasMapTraffic(list)){
    idleViewStartedAt=null;idleViewPhase=-1;
    return false;
  }
  const now=Date.now();
  if(now<manualMapUntil)return true;
  if(idleViewStartedAt===null)idleViewStartedAt=now;
  const view=idleViewPlan(now-idleViewStartedAt);
  if(view.phase!==idleViewPhase){
    idleViewPhase=view.phase;
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const bounds=areaBounds(63.1118,7.8245,view.radius);
    const options={padding:[16,16],maxZoom:10,animate:!reduced,duration:2};
    if(reduced)map.fitBounds(bounds,options);else map.flyToBounds(bounds,options);
  }
  return true;
}
map.on('dragstart',()=>{manualMapUntil=Date.now()+30000;idleViewStartedAt=null;idleViewPhase=-1;});
function confirmedKsuArrival(p){
  const info=ksuFlightInfo(p);
  if(info && info.direction==='Ankomst KSU' && info.status!=='Innstilt')return true;
  const destination=confirmedRouteDestination(p);
  return Boolean(destination && destination.code==='KSU');
}
function kristiansundPoint(){
  return [mapAreas.city.lat,mapAreas.city.lon];
}
function fitWithKristiansund(p,points,options={}){
  const pts=[...points];
  if(!confirmedKsuArrival(p))pts.push(kristiansundPoint());
  map.fitBounds(L.latLngBounds(pts),options);
}
function focusLocalRoute(p){
  if(!p||!local25Traffic(p))return false;
  const aps=Array.isArray(p.routeData?._airports)?p.routeData._airports:[];
  if(aps.length<2)return false;

  const plane=[p.lat,p.lon];
  // Lokal-first: følg flyet, men Kristiansund sentrum skal alltid være synlig.
  // Selve rutelinjene tegnes fortsatt helt til avgang/destinasjon.
  fitWithKristiansund(p,[plane],{padding:[65,65],maxZoom:10});

  selected=p;
  select(p,false);
  if($('fs-status'))$('fs-status').textContent='lokal passerende rute · '+(p.flight||p.reg||p.hex);
  return true;
}
function ksuApproachContext(p){
  if(!p||!confirmedKsuArrival(p)||p.signalLost)return null;

  const dNm=ksuDistanceNm(p);
  const alt=Number(p.alt);
  const gs=Number(p.gs);
  const vr=Number(p.vr);
  const tr=getTrackDeg(p);
  const ksu=airportByCode('KSU');
  const toKsu=bearingBetween(p.lat,p.lon,ksu.lat,ksu.lon);
  const toward=tr!==null&&angleDiff(tr,toKsu)<=65;
  const descending=Number.isFinite(vr)&&vr<-150;

  let etaMin=null;
  if(Number.isFinite(gs)&&gs>120)etaMin=(dNm/gs)*60;

  const descentStarted=
    descending ||
    (Number.isFinite(alt)&&alt<=18000&&dNm<=85) ||
    (etaMin!==null&&etaMin<=18&&toward);

  if(!descentStarted)return null;

  let maxZoom=7;
  let padding=[70,70];
  let label='Starter innflyging mot KSU';

  if(dNm<=70 || (etaMin!==null&&etaMin<=15)){
    maxZoom=8;
    padding=[75,75];
    label='Nedstigning mot KSU';
  }
  if(dNm<=45 || (etaMin!==null&&etaMin<=10)){
    maxZoom=9;
    padding=[85,85];
    label='Nærmer seg KSU';
  }
  if(dNm<=28 || (etaMin!==null&&etaMin<=7)){
    maxZoom=10;
    padding=[95,95];
    label='Innflyging mot KSU';
  }
  if(dNm<=15 || (etaMin!==null&&etaMin<=4)){
    maxZoom=11;
    padding=[105,105];
    label='Siste del av innflygingen';
  }
  if(dNm<=8){
    maxZoom=12;
    padding=[115,115];
    label='Kort finale mot KSU';
  }

  return {dNm,etaMin,maxZoom,padding,label};
}
function focusKsuApproach(p,ctx){
  if(!p||!ctx)return false;
  const ksu=airportByCode('KSU');
  const points=[[ksu.lat,ksu.lon],[p.lat,p.lon]];
  const targetBounds=L.latLngBounds(points);

  // Unngå brå hopp: bare juster når flyet nærmer seg kanten eller zoomnivået er for grovt.
  const inset=map.getBounds().pad(-0.12);
  const needsMove=!points.every(pos=>inset.contains(pos)) || map.getZoom()<ctx.maxZoom-1 || map.getZoom()>ctx.maxZoom+1;
  if(needsMove){
    map.fitBounds(targetBounds,{
      padding:ctx.padding,
      maxZoom:ctx.maxZoom,
      animate:true,
      duration:0.8
    });
  }

  selected=p;
  select(p,false);
  if($('fs-status')){
    const eta=ctx.etaMin!==null&&ctx.etaMin<25?(' · ca. '+Math.max(1,Math.round(ctx.etaMin))+' min til KSU'):'';
    $('fs-status').textContent=ctx.label+eta+' · '+(p.flight||p.reg||p.hex);
  }
  return true;
}

function followNearest(list,s){
  if(focusIdleCandidate(list))return;
  const sorted=list.filter(p=>(!p.signalLost&&ksuDistanceNm(p)<=50)||confirmedKsuArrival(p)).sort((a,b)=>a.d-b.d);
  const priority=priorityKsuAircraft(sorted);
  const local25=sorted.filter(local25Traffic).sort((a,b)=>a.d-b.d)[0]||null;
  const priorityNm=priority?nm(priority.d):Infinity;

  // Lokal-first: trafikk innen 25 NM får kartfokus foran et KSU-fly som
  // fortsatt er mer enn 50 NM unna. KSU-flyet spores fortsatt i bakgrunnen.
  const localWins=Boolean(local25 && (!priority || priorityNm>50));
  const passerby=!priority&&!local25?priorityPasserby(sorted):null;
  const nearest=localWins?local25:(priority||local25||passerby||sorted[0]);
  if(!nearest){ applyMapLevel(s); return; }

  const airport=[63.1118,7.8245];
  const nearestNm=nm(nearest.d);
  const ground=priority&&!localWins?ksuGroundContext(priority):null;
  const remoteDeparture=priority&&!localWins?remoteKsuDepartureContext(priority):null;
  const approach=priority&&!localWins?ksuApproachContext(priority):null;
  const airportFocus=genericAirportFocus(nearest);

  // Bekreftede KSU-ankomster ved avgangsflyplassen får tett flyplassfokus.
  // Når flyet er ordentlig i lufta, faller denne konteksten bort automatisk.
  if(priority && !localWins && remoteDeparture && focusRemoteKsuDeparture(priority,remoteDeparture)){
    idleFocusIndex=0;
    return;
  }

  // Når nedstigningen mot KSU begynner, trekk kartet gradvis inn.
  if(priority && !localWins && approach && focusKsuApproach(priority,approach)){
    idleFocusIndex=0;
    return;
  }

  // Når et passerende lokalfly har bekreftet rute, vis avgang → fly → mål.
  if(localWins && focusLocalRoute(nearest)){
    idleFocusIndex=0;
    return;
  }

  // KSU-prioritet beholdes. For andre fly får siste del av innflyging / bakken
  // tett flyplassutsnitt i stedet for vanlig oversiktszoom.
  if((!priority||localWins) && airportFocus && focusAirportArrival(nearest,airportFocus)){
    idleFocusIndex=0;
    return;
  }

  if(priority && !localWins && ground){
    idleFocusIndex=0;
    const points=[[ground.airport.lat,ground.airport.lon],[priority.lat,priority.lon]];
    if(map.getZoom()<12 || !points.every(pos=>map.getBounds().pad(-0.2).contains(pos))){
      fitWithKristiansund(priority,points,{padding:[55,55],maxZoom:14});
    }
    if(map.getZoom()<12)map.setZoom(12);
    selected=priority;
    select(priority,false);
    if($('fs-status'))$('fs-status').textContent=ground.label+' · '+(priority.flight||priority.reg||priority.hex);
    return;
  }

  if(priority && !localWins && nearestNm>50){
    idleFocusIndex=0;
    fitWithKristiansund(priority,[airport,[priority.lat,priority.lon]],{
      padding:[55,55],
      maxZoom:7
    });
    selected=priority;
    select(priority,false);
    if($('fs-status'))$('fs-status').textContent='følger KSU-rute · '+(priority.flight||priority.reg||priority.hex);
    return;
  }

  if(priority && !localWins && nearestNm<=50){
    idleFocusIndex=0;
    let maxZoom=8;
    let padding=[85,85];
    if(nearestNm<=30)maxZoom=9;
    if(nearestNm<=20){maxZoom=9;padding=[95,95];}
    if(nearestNm<=12){maxZoom=10;padding=[105,105];}
    if(nearestNm<=6){maxZoom=11;padding=[115,115];}
    if(nearestNm<=2){maxZoom=12;padding=[125,125];}

    const focusPoints=[airport,[priority.lat,priority.lon]];
    fitWithKristiansund(priority,focusPoints,{padding,maxZoom});

    // Sikkerhet: flyet skal alltid være synlig i kartbildet.
    if(!map.getBounds().pad(-0.08).contains([priority.lat,priority.lon])){
      fitWithKristiansund(priority,focusPoints,{padding:[135,135],maxZoom:Math.max(7,maxZoom-1)});
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
    fitWithKristiansund(nearest,[airport,[nearest.lat,nearest.lon]],{
      padding:[70,70],
      maxZoom
    });
    return;
  }

  if(nearestNm<=50){
    idleFocusIndex=0;
    const nearby=sorted.filter(p=>nm(p.d)<=50);
    const points=[airport,...nearby.map(p=>[p.lat,p.lon])];
    fitWithKristiansund(nearest,points,{
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
function validAirportLabel(value){
  const v=String(value||'').trim();
  if(!v)return false;
  // Reject raw coordinate strings and fabricated "L 63.123" airport identifiers.
  if(/^L?\s*[-+]?\d{1,3}\.\d+/i.test(v))return false;
  if(/^-?\d{1,3}\.\d+\s*[, ]\s*-?\d{1,3}\.\d+/.test(v))return false;
  return true;
}
function validRouteAirport(a){
  if(!a)return false;
  const code=String(a.iata||a.icao||a.code||'').trim();
  const place=String(a.city||a.name||'').trim();
  return (/^[A-Z]{3,4}$/i.test(code)||validAirportLabel(place)) &&
    (!code||/^[A-Z]{3,4}$/i.test(code)) &&
    (!place||validAirportLabel(place));
}
function routeText(r){
  if(!r||r.plausible===false||r.airport_codes==='unknown')return'Rute ikke tilgjengelig';
  const aps=Array.isArray(r._airports)?r._airports:[];
  if(aps.length>=2 && validRouteAirport(aps[0]) && validRouteAirport(aps[aps.length-1])){
    const from=airportLabel(aps[0]),to=airportLabel(aps[aps.length-1]);
    if(from&&to)return `${from} → ${to}`;
  }
  if(r.airport_codes&&r.airport_codes!=='unknown' && /^[A-Z]{3,4}[-_][A-Z]{3,4}$/i.test(String(r.airport_codes))){
    return String(r.airport_codes).replace(/[-_]/g,' → ');
  }
  return'Rute ikke tilgjengelig';
}
function routeCardParts(p){
  const r=p?.routeData;
  const aps=Array.isArray(r?._airports)?r._airports:[];
  if(aps.length>=2 && validRouteAirport(aps[0]) && validRouteAirport(aps[aps.length-1])){
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
  if(parts.length===2 && parts.every(x=>/^[A-Z]{3,4}$/i.test(x))){
    return {fromCode:parts[0],fromPlace:'',toCode:parts[1],toPlace:''};
  }
  return null;
}
function militaryAircraftLabel(p){
  const f=(p?.flight||'').toUpperCase();
  const type=(p?.type||'').toUpperCase();
  const op=((p?.operator||'')+' '+(p?.desc||'')).toLowerCase();

  const militaryCall=/^(RANGR|RCH|RRR|GAF|IAM|BAF|NAF|NATO|CNV|DUKE|REACH)/.test(f);
  const militaryType=/^(C30J|C130|A400|C17|KC46|K35R|F16|F35|EUFI|HAWK|P3|P8|E3CF|GLF5|GLF6)$/.test(type);
  const militaryText=/military|air force|forsvaret|army|navy|marine corps/.test(op);
  if(!(militaryCall||militaryType||militaryText))return '';

  const names={
    C30J:'KC-130J Hercules',
    C130:'C-130 Hercules',
    A400:'Airbus A400M',
    C17:'C-17 Globemaster III',
    KC46:'KC-46 Pegasus',
    K35R:'KC-135 Stratotanker',
    F16:'F-16 Fighting Falcon',
    F35:'F-35 Lightning II',
    EUFI:'Eurofighter Typhoon',
    P3:'P-3 Orion',
    P8:'P-8 Poseidon',
    E3CF:'E-3 AWACS'
  };
  return names[type]?'Militærfly · '+names[type]:'Militærfly';
}
function specialService(p){
  const f=(p.flight||'').toUpperCase();
  const op=(p.operator||'').toLowerCase();
  const desc=(p.desc||'').toLowerCase();
  const type=(p.type||'').toUpperCase();

  if(f==='BNOV' || /babcock|luftambulanse|air ambulance|ambulance/.test(op+' '+desc)) return 'Ambulansefly';
  if(/politi|police/.test(op+' '+desc) || /^POL/.test(f)) return 'Politi';
  if(/redning|rescue|sar/.test(op+' '+desc) || /^SAR/.test(f)) return 'Redning';
  const military=militaryAircraftLabel(p);
  if(military)return military;
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
function routeLookupLabel(p){
  if(!p)return'';
  const d=p.routeLookupDiagnostics;
  const diag=d
    ? [
        d.adsb_lol_attempted ? ('adsb.lol: '+(d.adsb_lol_result==='found'?'treff':d.adsb_lol_result==='no-route'?'ingen treff':d.adsb_lol_result)) : null,
        d.flightaware_attempted ? ('FlightAware: '+(d.flightaware_result==='found'?'treff':d.flightaware_result==='no-route'?'ingen treff':d.flightaware_result)) : null
      ].filter(Boolean).join(' · ')
    : '';
  if(p.routeData){
    const base=p.routeLookupSource?('Rute funnet via '+p.routeLookupSource):'Rute funnet';
    return diag?base+' · '+diag:base;
  }
  if(p.routeLookupState==='trying')return'Ruteoppslag pågår…';
  if(p.routeLookupState==='not-found')return diag?('Oppslag utført · '+diag):'Oppslag utført · ingen rute funnet';
  if(p.routeLookupState==='error')return'Ruteoppslag feilet';
  const scope=routeLookupScope(p);
  if(scope)return'Ruteoppslag ikke forsøkt ennå';
  return'Ikke kvalifisert for ekstra ruteoppslag';
}
function displayRoute(p){
  const service=specialService(p);
  if(service)return service;
  if(p.route&&p.route!=='Rute ikke tilgjengelig'&&p.route!=='Henter rute…')return p.route;
  const stable=cachedAircraftRoute(p);
  if(stable){
    p.routeData=p.routeData||stable;
    p.route=routeText(stable);
    return p.route;
  }
  const inferred=inferredRouteLabel(p);
  if(inferred)return `${inferred.label} · ${inferred.name}`;
  return 'Rute ikke tilgjengelig';
}
function routeLookupScope(p){
  if(p.ksuFlight)return 'ksu';
  const activeKey=selected?planeKey(selected):'';
  const isActive50=Boolean(activeKey&&activeKey===planeKey(p)&&nm(p.d)<=50&&!p.signalLost);
  if(isActive50)return 'active50';
  if(local25Traffic(p))return 'zone25';
  if(observablePasserby(p))return 'local';
  return '';
}
function canLookupRoute(p,now=Date.now()){
  const key=p?.flight?.trim();
  if(!key||routeRequests.has(key)||routeCache.get(key))return false;
  const last=routeAttempts.get(key);
  if(!last)return true;
  // Entering paid-lookup eligibility must bypass an earlier free-only miss.
  const rank={ '':0,local:1,zone25:1,active50:2,ksu:3 };
  return rank[routeLookupScope(p)]>rank[last.scope] || now-last.at>=5*60*1000;
}
async function enrichRoute(p){
  if(!p||!p.flight)return;
  const key=p.flight.trim();
  if(routeCache.get(key)){
    const r=routeCache.get(key);
    if(r)rememberAircraftRoute(p,r);
    p.routeData=r||null;
    p.route=routeText(r);
    if(selected&&selected.hex===p.hex)select(p,false);
    return;
  }
  if(!canLookupRoute(p))return;
  const scope=routeLookupScope(p);
  routeRequests.add(key);
  routeAttempts.set(key,{scope,at:Date.now()});
  p.routeLookupState='trying';
  p.routeLookupSource='';
  try{
    const u=new URL('https://flyradar-ksu.vidar-skoglund.workers.dev/route');
    u.searchParams.set('callsign',key);
    u.searchParams.set('lat',p.lat);
    u.searchParams.set('lon',p.lon);
    if(Number.isFinite(Number(p.alt)))u.searchParams.set('alt',Number(p.alt));
    if(scope)u.searchParams.set('fa_scope',scope);
    const resp=await fetch(u,{cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(12000)});
    if(!resp.ok)throw new Error('HTTP '+resp.status);
    const j=await resp.json();
    const r=j?.route||null;
    routeCache.set(key,r);
    if(r)rememberAircraftRoute(p,r);
    p.routeData=r;
    p.routeLookupSource=j?.source||'';
    p.routeLookupDiagnostics=j?.diagnostics||null;
    p.routeLookupState=r?'found':'not-found';
    p.route=routeText(r);
    if(selected&&selected.hex===p.hex)select(p,false);
  }catch(e){
    routeCache.set(key,null);
    p.routeData=null;
    p.routeLookupState='error';
    p.routeLookupSource='';
    p.route='Rute ikke tilgjengelig';
    if(selected&&selected.hex===p.hex)select(p,false);
  }finally{
    routeRequests.delete(key);
  }
}
function mergeAircraft(primary,secondary,primaryName='adsb.fi',secondaryName='adsb.lol'){
  const byKey=new Map();
  const add=(a,source)=>{
    const key=(a.hex||a.r||a.flight||'').toString().trim().toLowerCase();
    if(!key)return;
    const copy={...a,_source:source};
    const old=byKey.get(key);
    if(!old){byKey.set(key,copy);return;}
    const age=x=>{const n=Number(x.seen_pos??x.seen);return Number.isFinite(n)&&n>=0?n:Infinity;};
    const best=age(copy)<age(old)?copy:old;
    const other=best===copy?old:copy;
    byKey.set(key,{...other,...best,_source:old._source+' + '+source});
  };
  primary.forEach(a=>add(a,primaryName));
  secondary.forEach(a=>add(a,secondaryName));
  return [...byKey.values()];
}
// Browser-side rescue for adsb.fi when the Cloudflare Worker is blocked.
let fiRescueLastAttempt=0,fiRescueLastSuccess=0,fiRescueAircraft=[];
let fiRescueRetryAfter=0,fiRescueError='',fiRescueDirectOk=false;
async function rescueAdsbFi(s){
  const now=Date.now();
  // Share one recent successful snapshot; never label an old snapshot as live.
  if(now<fiRescueRetryAfter || now-fiRescueLastAttempt<30000){
    return now-fiRescueLastSuccess<30000?fiRescueAircraft:null;
  }
  fiRescueLastAttempt=now;
  fiRescueDirectOk=false;
  try{
    const url=`https://opendata.adsb.fi/api/v3/lat/${s.lat}/lon/${s.lon}/dist/${s.r}`;
    const response=await fetch(url,{cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(8000)});
    if(!response.ok){
      // Stop retrying on access denials and rate limits.
      if([400,401,403,404,429].includes(response.status)){
        fiRescueRetryAfter=Date.now()+(response.status===429?10:5)*60*1000;
      }
      throw new Error('HTTP '+response.status);
    }
    const data=await response.json();
    const aircraft=data.ac||data.aircraft;
    if(!Array.isArray(aircraft))throw new Error('invalid aircraft payload');
    fiRescueAircraft=aircraft;
    fiRescueLastSuccess=Date.now();
    fiRescueError='';
    fiRescueDirectOk=true;
    return aircraft;
  }catch(error){
    fiRescueError=String(error?.message||error);
    // Network/CORS errors also need backoff to avoid hammering the endpoint.
    if(!fiRescueRetryAfter || fiRescueRetryAfter<Date.now())fiRescueRetryAfter=Date.now()+120000;
    console.warn('adsb.fi direct request unavailable:',fiRescueError);
    return null;
  }
}
async function fetchJson(url){
  try{
    const r=await fetch(url,{credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(12000)});
    if(!r.ok)throw new Error('HTTP '+r.status);
    return await r.json();
  }catch(e){
    const proxied='https://proxy.cors.dev/'+url;
    const r=await fetch(proxied,{credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(12000)});
    if(!r.ok)throw new Error('HTTP '+r.status);
    return await r.json();
  }
}
function vesselIcon(v){
  const tr=Number.isFinite(Number(v.heading))?Number(v.heading):(Number.isFinite(Number(v.course))?Number(v.course):0);
  return L.divIcon({
    className:'vessel-wrap',
    html:`<div class="vessel-marker" style="transform:rotate(${tr}deg)">▲</div>`,
    iconSize:[26,26],iconAnchor:[13,13]
  });
}
function vesselKind(v){
  const t=Number(v.shipType);
  if(t>=40&&t<=49)return 'Hurtiggående passasjerfartøy';
  if(t>=60&&t<=69)return 'Passasjerskip';
  return 'Skip';
}
// During the ADS-B pause, show and follow moving AIS vessels instead.
let vesselFocusMmsi='',vesselFocusChangedAt=0,vesselLastFocusAt=0;
const escapeVesselText=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function focusMovingVessel(force=false){
  if(Date.now()>=ADSB_PAUSE_UNTIL_MS)return;
  const moving=vessels.filter(v=>Number(v.speed)>=1&&Number(v.distanceNm)<=25&&Number.isFinite(Number(v.lat))&&Number.isFinite(Number(v.lon)));
  if(!moving.length)return;
  const now=Date.now();
  let selected=moving.find(v=>String(v.mmsi)===vesselFocusMmsi);
  if(!selected||now-vesselFocusChangedAt>45000){
    const sorted=moving.slice().sort((a,b)=>Number(b.speed)-Number(a.speed));
    const index=sorted.findIndex(v=>String(v.mmsi)===vesselFocusMmsi);
    selected=sorted[(index+1)%sorted.length];
    vesselFocusMmsi=String(selected.mmsi||selected.name);
    vesselFocusChangedAt=now;
    force=true;
  }
  if(force||now-vesselLastFocusAt>15000){
    vesselLastFocusAt=now;
    map.flyTo([Number(selected.lat),Number(selected.lon)],Math.max(map.getZoom(),11),{animate:true,duration:1.8});
  }
}
function renderVessels(){
  vesselLayer.clearLayers();
  for(const v of vessels){
    if(!Number.isFinite(Number(v.lat))||!Number.isFinite(Number(v.lon)))continue;
    const name=v.name||('MMSI '+(v.mmsi||'ukjent'));
    const detail=[
      vesselKind(v),
      Number.isFinite(Number(v.distanceNm))?Number(v.distanceNm).toFixed(1)+' NM fra KSU':'',
      Number.isFinite(Number(v.speed))?Number(v.speed).toFixed(1)+' kt':'',
      v.destination?'mål '+v.destination:''
    ].filter(Boolean).join(' · ');
    L.marker([v.lat,v.lon],{icon:vesselIcon(v),zIndexOffset:500})
      .bindTooltip('Fartøy: '+escapeVesselText(name),{direction:'top',offset:[0,-12]})
      .bindPopup('<b>'+escapeVesselText(name)+'</b><br>'+escapeVesselText(detail)+'<br><small>AIS · Kystverket</small>')
      .addTo(vesselLayer);
  }
  focusMovingVessel();
}
async function loadVessels(){
  try{
    const r=await fetch('https://flyradar-ksu.vidar-skoglund.workers.dev/vessels',{cache:'no-store',credentials:'omit'});
    if(!r.ok)throw new Error('HTTP '+r.status);
    const j=await r.json();
    vessels=Array.isArray(j?.vessels)?j.vessels:[];
    renderVessels();
    const el=document.getElementById('vessel-live-status');
    if(el)el.textContent=vessels.length
      ?vessels.length+' fartøy i bevegelse innen 25 NM · AIS fra Kystverket'
      :'Ingen fartøy i bevegelse registrert innen 25 NM';
  }catch(e){
    vessels=[];
    vesselLayer.clearLayers();
    const el=document.getElementById('vessel-live-status');
    if(el)el.textContent='AIS-data er ikke tilgjengelige akkurat nå';
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
        iconSize:[12,12],iconAnchor:[6,6]
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
    const r=await fetch('data/avinor-ksu.json?v='+bucket,{cache:'no-store',signal:AbortSignal.timeout(12000)});
    if(!r.ok)throw new Error('HTTP '+r.status);
    const j=await r.json();
    avinorFlights=Array.isArray(j.flights)?j.flights:[];
    renderAvinor();
    await updateRemoteKsuTracking();
    attachAvinorMatches();
    renderAvinor();
    render(true);
  }catch(e){
    // Behold siste gode Avinor-data ved midlertidige nett-/filfeil.
    // Ikke nullstill KSU-match eller "Neste på KSU" mens live ADS-B fortsatt går.
    attachAvinorMatches();
    renderAvinor();
  }
}
function avinorFlightKey(f){
  if(!f)return '';
  if(f.uniqueId)return String(f.uniqueId);
  return [f.flight_id||'',f.schedule_time||'',f.arr_dep||'',f.airport||''].join('|');
}
function scheduleDisplayTime(f){
  const revised=String(f.status_code||'').toUpperCase()==='E'?Date.parse(f.status_time||''):NaN;
  return Number.isFinite(revised)?revised:Date.parse(f.schedule_time||'');
}
function upcomingSchedule(f,now){
  const status=String(f.status_code||'').toUpperCase();
  if(status==='A'||status==='D')return false;
  const time=scheduleDisplayTime(f);
  return Number.isFinite(time) && time>=now-30*60*1000;
}
function renderAvinor(){
  const el=$('avinor-list');
  const side=$('avinor-list-side');
  if(!el&&!side)return;
  if(!avinorFlights.length){
    if(el)el.innerHTML='<div class="schedule-empty">Ingen planlagte KSU-data tilgjengelig akkurat nå.</div>';
    if(side)side.innerHTML='<div class="schedule-empty">Ingen kommende fly.</div>';
    return;
  }
  const now=Date.now();
  const rows=avinorFlights
    .filter(f=>upcomingSchedule(f,now))
    .sort((a,b)=>scheduleDisplayTime(a)-scheduleDisplayTime(b))
    .slice(0,4);

  const rowHtml=(f,index,compact=false)=>{
    const t=Number.isFinite(scheduleDisplayTime(f))?new Date(scheduleDisplayTime(f)).toLocaleTimeString('no-NO',{hour:'2-digit',minute:'2-digit'}):'–';
    const dep=f.arr_dep==='D';
    const heli=/^(HKS|HMB)/i.test(f.flight_id||'') || /helicopter/i.test((f.airline_name||'')+' '+(f.airline||''));
    const route=f.airport==='KSU'?'':`${dep?'Til':'Fra'} ${f.airport||'–'}`;
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
      opStatus='Signal mistet';
      statusClass='stale';
    }else if(nearWindow){
      opStatus='';
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
        ${!compact&&distanceText?`<div class="schedule-live-detail">${distanceText}</div>`:compact&&matched?`<div class="schedule-live-detail">${distanceText}</div>`:''}
      </div>
      <div class="schedule-time">${t}</div>
    </div>`;
  };

  if(el)el.innerHTML=rows.map((f,index)=>rowHtml(f,index,false)).join('') || '<div class="schedule-empty">Ingen kommende flyvninger.</div>';
  if(side)side.innerHTML=rows.slice(0,5).map((f,index)=>rowHtml(f,index,true)).join('') || '<div class="schedule-empty">Ingen kommende fly.</div>';
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
  if(code==='E'){
    const scheduled=Date.parse(f.schedule_time||'');
    const estimated=Date.parse(f.status_time||'');
    return Number.isFinite(scheduled)&&Number.isFinite(estimated)&&estimated>scheduled?'Forsinket':'';
  }
  const known={A:'Landet',D:'Avreist',C:'Innstilt'};
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
    if(!p.ksuFlight){
      const call=compactFlightId(p.flight);
      if(call){
        for(const f of avinorFlights){
          const identity=remoteKsuIdentityCache.get(avinorFlightKey(f));
          if(identity?.callsign && compactFlightId(identity.callsign)===call){
            p.ksuFlight=f;
            break;
          }
        }
      }
    }

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
  const parked=ksuParkedState(p);
  if(parked)return parked.label;
  const ground=ksuGroundContext(p);
  if(ground)return ground.label;
  if(info.direction==='Ankomst KSU'){
    if(info.status==='Landet'){
      const d=nm(p.d),gs=Number(p.gs),alt=Number(p.alt);
      const physicallyDown=d<=5 &&
        ((!Number.isFinite(gs)||gs<=80) &&
         (!Number.isFinite(alt)||alt<=2500));
      if(physicallyDown)return 'Landet på Kvernberget';
    }
    if(movement==='Ser ut til å være på innflyging')return 'På innflyging til Kvernberget';
    if(movement==='Nærmer seg KSU')return 'KSU-ankomst nærmer seg';
    return info.status==='Landet'?'Avinor: landet · følger fortsatt signal':'Planlagt ankomst KSU';
  }
  if(info.status==='Avreist')return 'Avreist fra Kvernberget';
  if(movement==='Har forlatt KSU')return 'Har forlatt Kvernberget';
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
// Proximity is always measured from KSU, independent of map centre and filters.
const proximityState=new Map();
let proximityReady=false, proximityAudio=null, proximitySound=false;
function ksuDistanceNm(p){return nm(dist(63.1118,7.8245,Number(p.lat),Number(p.lon)))}
function proximityCrossings(list){
  const events=[];
  for(const p of list){
    const key=planeKey(p), d=ksuDistanceNm(p);
    if(!key||p.signalLost||!Number.isFinite(d))continue;
    const old=proximityState.get(key)||{inside50:false,inside25:false};
    const inside50=d<=50 || (old.inside50&&d<=52);
    const inside25=d<=25 || (old.inside25&&d<=27);
    if(proximityReady && ((inside50&&!old.inside50)||(inside25&&!old.inside25)))events.push(p);
    proximityState.set(key,{inside50,inside25});
  }
  proximityReady=true;
  return events;
}
function playProximityTone(){
  if(!proximitySound||!proximityAudio||proximityAudio.state!=='running')return;
  const t=proximityAudio.currentTime, oscillator=proximityAudio.createOscillator(), gain=proximityAudio.createGain();
  oscillator.frequency.setValueAtTime(740,t);
  oscillator.frequency.setValueAtTime(880,t+.12);
  gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(.12,t+.02);
  gain.gain.exponentialRampToValueAtTime(.001,t+.35);
  oscillator.connect(gain);gain.connect(proximityAudio.destination);
  oscillator.start(t);oscillator.stop(t+.36);
}
async function toggleProximitySound(){
  const button=$('proximity-sound');
  if(proximitySound){proximitySound=false;button.textContent='Nærhetslyd: av';button.setAttribute('aria-pressed','false');return;}
  try{
    const Audio=window.AudioContext||window.webkitAudioContext;
    proximityAudio=proximityAudio||new Audio();
    await proximityAudio.resume();
    proximitySound=true;button.textContent='Nærhetslyd: på';button.setAttribute('aria-pressed','true');playProximityTone();
  }catch(e){button.textContent='Lyd kunne ikke aktiveres';}
}
function withinKsuAlertArea(p){return !p.signalLost&&ksuDistanceNm(p)<=50}
function renderProximityAlert(list){
  const banner=$('proximity-alert');
  if(!banner)return;
  const near=list.filter(withinKsuAlertArea).sort((a,b)=>ksuDistanceNm(a)-ksuDistanceNm(b));
  banner.hidden=!near.length;
  if(!near.length)return;
  const p=near[0],d=ksuDistanceNm(p),name=p.flight||p.reg||p.hex||'Fly';
  const altitude=Number(p.alt);
  const lowFlying=Number.isFinite(altitude)&&altitude<=8000;
  const heli=isHelicopter(p);
  const title=confirmedKsuArrival(p)?'Ankomst KSU':lowFlying?'Lavtflygende i KSU-området':'Passerer KSU-området';
  const type=String(p.type||'').trim().toUpperCase();
  const model={S92:'Sikorsky S-92',S76:'Sikorsky S-76',H145:'Airbus H145',H135:'Airbus H135',AW13:'Leonardo AW139',A139:'Leonardo AW139',AW16:'Leonardo AW169',A169:'Leonardo AW169'}[type]||'';
  const description=heli?(model||'Helikopter'):(type&&/^[A-Z0-9]{2,5}$/.test(type)?type:'');
  const registration=p.reg&&String(p.reg).toUpperCase()!==String(name).toUpperCase()?' · '+p.reg:'';
  const text=`${heli?'🚁':'✈'} ${title} · ${name}${description?' · '+description:''}${registration} · ${d.toFixed(1)} NM fra KSU${near.length>1?' · +'+(near.length-1)+' fly':''}`;
  if(banner.textContent!==text)banner.textContent=text;
  banner.classList.toggle('close',d<=25);
}
// Lightweight local diagnostics; no extra ADS-B API requests.
function recordAdsbDiagnostics(rawAircraft, sourceName){
  try{
    const key='flyradar-ksu-source-diagnostics-v1';
    const rows=JSON.parse(localStorage.getItem(key)||'[]');
    const now=Date.now();
    const valid=(rawAircraft||[]).filter(a=>Number.isFinite(Number(a.lat))&&Number.isFinite(Number(a.lon)));
    const ksu=mapAreas.airport;
    const near=valid.filter(a=>dist(ksu.lat,ksu.lon,Number(a.lat),Number(a.lon))<=50*1.852);
    const ages=near.map(a=>Number(a.seen_pos??a.seen)).filter(v=>Number.isFinite(v)&&v>=0);
    rows.push({time:new Date(now).toISOString(),source:sourceName,adsb:sourceState.adsb,airplanes:sourceState.apl,fi:sourceState.fi,near:near.length,fresh:ages.filter(v=>v<=30).length,oldestSeconds:ages.length?Math.round(Math.max(...ages)):null});
    localStorage.setItem(key,JSON.stringify(rows.slice(-500)));
  }catch(e){console.warn('ADS-B diagnostics unavailable',e);}
}
// Shared browser-local diagnostics for the administrator status page.
const ADMIN_LOG_KEY='flyradar-ksu-admin-log-v1';
function recordAdminStatus(event,details={}){
  try{
    const now=new Date().toISOString();
    const history=JSON.parse(localStorage.getItem(ADMIN_LOG_KEY)||'[]');
    history.push({at:now,event,...details});
    localStorage.setItem(ADMIN_LOG_KEY,JSON.stringify(history.slice(-1000)));
  }catch(e){console.warn('Admin history unavailable',e);}
}
function updateAdsbSourceLabel(mode){
  const el=$('adsb-source-label');
  if(!el)return;
  const names=[['fi','adsb.fi'],['adsb','adsb.lol'],['apl','Airplanes.live']];
  const active=names.filter(([key])=>sourceState[key]==='OK').map(([,name])=>name);
  const unavailable=names.filter(([key])=>sourceState[key]==='feil').map(([,name])=>name);
  el.textContent='Flydata: '+(active.join(' + ')||'ingen kilde bekreftet')+(mode==='worker'?' (via Worker)':mode==='combined'?' (Worker + direkte)':' (direkte)')+(unavailable.length?' · Feil: '+unavailable.join(', '):'');
  el.title='Aktive datakilder. Dette viser ikke hvilken mottaker som observerte hvert fly.'+(fiRescueError?' Direkte adsb.fi: '+fiRescueError+'. Neste forsøk tidligst '+new Date(fiRescueRetryAfter).toLocaleTimeString('no-NO'):'');
}
const ADSB_PAUSE_UNTIL_MS = 1795006013510;
async function refresh(){
  if (Date.now() < ADSB_PAUSE_UNTIL_MS) {
    planes = [];
    localPlanes = [];
    remoteKsuPlanes = [];
    $('status').textContent = 'Flydata midlertidig deaktivert til ' + new Date(ADSB_PAUSE_UNTIL_MS).toLocaleString('no-NO');
    $('status').className = 'muted';
    document.body.dataset.liveSource = 'paused';
    render(false);
    return;
  }
  let s=settings();
  $('status').textContent='Henter…';$('status').className='muted';
  home.setLatLng([s.lat,s.lon]);
  updateRangeRings(s);
  try{
    let merged=[], workerOk=false, sharedTracks=null;
    try{
      const wr=await fetch(WORKER_URL,{cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(12000)});
      if(!wr.ok)throw new Error('Worker HTTP '+wr.status);
      const w=await wr.json();
      if(!w||w.ok!==true||!Array.isArray(w.ac))throw new Error('Ugyldig Worker-svar');
      merged=w.ac;
      sharedTracks=w.tracks||null;
      sourceState.adsb=w.sources?.['adsb.lol']?.ok?'OK':'feil';
      sourceState.apl=w.sources?.['airplanes.live']?.ok?'OK':'feil';
      sourceState.fi=w.sources?.['adsb.fi']?.ok?'OK':'feil';
      workerOk=true;
      // A successful Worker response can still contain a failed adsb.fi source.
      // Try adsb.fi directly from the browser; keep the Worker's valid aircraft.
      if(sourceState.fi!=='OK'){
        const rescued=await rescueAdsbFi(s);
        if(rescued!==null){
          merged=mergeAircraft(merged,rescued,'Worker','adsb.fi');
          sourceState.fi='OK';
        }
      }
    }catch(workerError){
      const fiUrl=`https://opendata.adsb.fi/api/v3/lat/${s.lat}/lon/${s.lon}/dist/${s.r}`;
      const adsbUrl=`https://api.adsb.lol/v2/point/${s.lat}/${s.lon}/${s.r}`;
      const [fiRes,adsbRes]=await Promise.allSettled([fetchJson(fiUrl),fetchJson(adsbUrl)]);
      sourceState.fi=fiRes.status==='fulfilled'?'OK':'feil';
      sourceState.adsb=adsbRes.status==='fulfilled'?'OK':'feil';
      sourceState.apl='ikke brukt';
      const fiData=fiRes.status==='fulfilled'?(fiRes.value.ac||fiRes.value.aircraft||[]):[];
      const adsbData=adsbRes.status==='fulfilled'?(adsbRes.value.ac||[]):[];
      if(fiRes.status!=='fulfilled'&&adsbRes.status!=='fulfilled')throw workerError;
      merged=mergeAircraft(fiData,adsbData,'adsb.fi','adsb.lol');
    }

    updateAdsbSourceLabel(workerOk?(fiRescueDirectOk?'combined':'worker'):'direct');
    recordAdminStatus('flydata', {
      worker:workerOk?'OK':'feil',adsbLol:sourceState.adsb,adsbFi:sourceState.fi,
      airplanesLive:sourceState.apl,fiDirectError:fiRescueError||null,
      fiRetryAt:fiRescueRetryAfter?new Date(fiRescueRetryAfter).toISOString():null,
      aircraft:merged.length,source:workerOk?(fiRescueDirectOk?'worker+direct':'worker'):'direct'
    });
    recordAdsbDiagnostics(merged,workerOk?'worker':'direct-fallback');
    localPlanes=merged
      .filter(a=>a.lat!=null&&a.lon!=null)
      .map(a=>normalize(a,s))
      .filter(p=>nm(p.d)<=150)
      .sort((a,b)=>a.d-b.d);

    planes=retainRecentPlanes(mergeTrackedPlanes(localPlanes,remoteKsuPlanes));
    attachAvinorMatches();
    planes=preserveKsuLastKnown(planes);
    lastGoodPlanes=planes.map(p=>({...p}));
    if(!ingestSharedTracks(sharedTracks))updateTrackHistory(planes);
    queueLocal25RouteLookups(planes);
    check50NmNotifications(planes);
    if(proximityCrossings(planes).length)playProximityTone();
    renderProximityAlert(planes);
    const localCount=planes.filter(withinKsuAlertArea).length;
    const priority=priorityKsuAircraft(planes);
    const passerby=!priority?priorityPasserby(planes):null;
    const followed=priority||passerby||planes.filter(localRelevant).sort((a,b)=>a.d-b.d)[0];
    const followText=followed?' · følger '+(priority?'KSU ':passerby?'lokalt ':'')+(followed.flight||followed.reg||followed.hex):'';
    $('status').textContent=`${localCount} fly innen 50 NM${followText} · ${new Date().toLocaleTimeString('no-NO',{hour:'2-digit',minute:'2-digit'})}`;
    $('status').className='ok';
    document.body.dataset.liveSource=workerOk?'worker':'direct-fallback';
    render(true);
    if(selected)enrichRoute(selected);
  }catch(e){
    if($('proximity-alert'))$('proximity-alert').hidden=true;
    if(lastGoodPlanes.length){
      planes=lastGoodPlanes.map(p=>({...p}));
      const localCount=planes.filter(withinKsuAlertArea).length;
      $('status').textContent=`${localCount} fly innen 50 NM · viser sist kjente data`;
      $('status').className='muted';
      render(false);
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
  if(aps.length<2 || !validRouteAirport(aps[0]) || !validRouteAirport(aps[aps.length-1]))return;

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
function highlightSelectedAircraft(){
  const activeKey=selected?planeKey(selected):null;
  for(const [key,entry] of motionMarkers){
    const active=key===activeKey;
    entry.marker.getElement()?.classList.toggle('is-selected',active);
    entry.marker.setZIndexOffset(active?1200:100);
    entry.marker.getElement()?.classList.toggle('proximity-close',!entry.plane?.signalLost&&ksuDistanceNm(entry.plane||{})<=25);
  }
}
function select(p,lookupRoute=true){
  if(!p)return;
  selected=p;
  highlightSelectedAircraft();
  if(lookupRoute && p.flight && !p.routeData && canLookupRoute(p) && (!specialService(p)||p.ksuFlight)) setTimeout(()=>enrichRoute(p),0);
  drawRoute(p);
  drawTrackAndPrediction(p);
  $('hcall').textContent=p.flight||p.reg||p.hex||'Ukjent';
  $('hmeta').textContent=([p.operator,p.reg,p.type,p.desc].filter(Boolean).join(' · ')||p.hex)+(p.source?' · Kilde: '+p.source:'');
  $('hroute').textContent=displayRoute(p);
  $('hdist').textContent=fNm(p.d);
  $('halt').textContent=f(p.alt,' ft');
  $('hspd').textContent=f(p.gs,' kt');
  $('htrk').textContent=f(p.track,'°');
  $('hvr').textContent=f(p.vr,' ft/min');
}
function render(autoFit=false){
  const s=settings();
  let list=planes.slice();
  const nearCount=planes.filter(withinKsuAlertArea).length;
  const closestActive=planes.filter(p=>!p.signalLost&&Number.isFinite(ksuDistanceNm(p))).sort((a,b)=>ksuDistanceNm(a)-ksuDistanceNm(b))[0];
  const closestText=closestActive?ksuDistanceNm(closestActive).toFixed(1)+' NM':'–';
  const updatedText=new Date().toLocaleTimeString('no-NO');
  $('count').textContent=nearCount;
  $('closest').textContent=closestText;
  $('updated').textContent=updatedText;
  if($('fs-count'))$('fs-count').textContent=nearCount;
  if($('fs-closest'))$('fs-closest').textContent=closestText;
  if($('fs-updated'))$('fs-updated').textContent=updatedText;
  if($('fs-status'))$('fs-status').textContent=$('status')?.textContent||'';
  if($('fs-aircraft')){
    const p=list.find(p=>!p.signalLost)||null;
    $('fs-aircraft').innerHTML=p
      ? `<b>${p.flight||p.reg||p.hex||'Ukjent'} · ${fNm(p.d)}</b><span>${[p.reg,p.type,ksuFlightInfo(p)?.route||displayRoute(p),ksuOperationalStatus(p),f(p.alt,' ft'),f(p.gs,' kt')].filter(Boolean).join(' · ')}</span>`
      : '<b>Ingen fly</b><span>–</span>';
  }
  const priority=priorityKsuAircraft(list);
  const local25=list.filter(local25Traffic).sort((a,b)=>a.d-b.d)[0]||null;
  const priorityNm=priority?nm(priority.d):Infinity;
  const localWins=Boolean(local25 && (!priority || priorityNm>50));
  const passerby=!priority&&!local25?priorityPasserby(list):null;

  // Lokal-first gjelder også aktivt fly, ikke bare kartzoom.
  // Et fly innen 25 NM skal erstatte et gammelt/fjernt valgt fly.
  if(localWins)selected=local25;
  else if(priority && (!selected || ksuPriorityScore(priority)>ksuPriorityScore(selected)))selected=priority;
  else if(passerby && (!selected || !selected.ksuFlight))selected=passerby;
  const visibleKeys=new Set();
  const motionNow=Date.now();
  list.forEach(p=>{
    const key=planeKey(p);
    if(!key)return;
    visibleKeys.add(key);
    let entry=motionMarkers.get(key);
    if(!entry){
      entry={marker:L.marker(interpolatedPlanePosition(p,motionNow),{icon:planeIcon(p)}).addTo(layer),plane:p,heading:getTrackDeg(p)??0};
      entry.marker.on('click',()=>{select(entry.plane);render(false)});
      motionMarkers.set(key,entry);
    }else if(entry.plane!==p){
      const current=motionPosition(entry,motionNow);
      const target=interpolatedPlanePosition(p,motionNow);
      // Preserve the displayed position when a new fix arrives, then blend out
      // the correction instead of snapping back to the raw ADS-B coordinates.
      entry.offset=[current[0]-target[0],current[1]-target[1]];
      entry.correctedAt=motionNow;
      entry.plane=p;
      entry.marker.setIcon(planeIcon({...p,track:entry.heading}));
    }
    const marker=entry.marker;
    const tooltip=`${p.ksuFlight?'KSU · ':observablePasserby(p)?'SE/HØR · ':localRelevant(p)?'NÆR · ':''}${p.flight||p.reg||p.hex} · ${fNm(p.d)}${p.remoteTracked?' · fjernsporing':''}${p.signalLost?' · SIGNAL MISTET':''}`;
    if(marker.getTooltip())marker.setTooltipContent(tooltip);
    else marker.bindTooltip(tooltip,{direction:'top',offset:[0,-15]});
  });
  for(const [key,entry] of motionMarkers){
    if(!visibleKeys.has(key)){
      layer.removeLayer(entry.marker);
      motionMarkers.delete(key);
      liveDistanceState.delete(key);
    }
  }
  const nearest=list.find(p=>!p.signalLost)||null;
  const current=selected&&list.find(p=>p.hex===selected.hex&&!p.signalLost);
  const shown=current||nearest;
  if(shown){
    selected=shown;
    const localCountNow=planes.filter(withinKsuAlertArea).length;
    const activePrefix=shown.ksuFlight?'KSU ':observablePasserby(shown)?'lokalt ':'';
    $('status').textContent=`${localCountNow} fly innen 50 NM · følger ${activePrefix}${shown.flight||shown.reg||shown.hex} · ${new Date().toLocaleTimeString('no-NO',{hour:'2-digit',minute:'2-digit'})}`;
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
          : `<div class="flight-route fallback"><div class="route-loading">${displayRoute(shown)}</div><div class="route-state">${routeLookupLabel(shown)}</div></div>`;
    $('cards').innerHTML=`<div class="card aircraft-card ${localRelevant(shown)?'local-card':''}">
      <div class="aircraft-head">
        <div>
          <div class="aircraft-title">
            <span class="call">${shown.flight||shown.reg||shown.hex||'Ukjent'}</span>
            ${shown.type?`<span class="type-pill">${shown.type}</span>`:''}
          </div>
          <div class="operator">${shown.operator||service||shown.desc||''}</div>
        </div>
        <div class="dist">${shown.signalLost?'Siste kjente avstand · ':''}${liveDistanceText(shown)}</div>
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
        <span>${shown.reg?('REG. '+shown.reg):''}</span>
      </div>
      <div class="movement-status ${shown.ksuFlight?'ksu':inferred?'inferred':''}">${shown.signalLost?signalStateText(shown):(shown.ksuFlight?ksuOperationalStatus(shown):(inferred?`Sannsynlig mot ${inferred.code}`:ksuOperationalStatus(shown)))}</div>
      ${visibilityHint(shown)?`<div class="movement-status">${visibilityHint(shown)}</div>`:''}
      <div class="movement hidden">${shown.signalLost?(signalStateText(shown).startsWith('Parkert')?'Siste kjente posisjon ved flyplass':signalStateText(shown).startsWith('Landet')?'Siste kjente posisjon etter landing':'Viser siste kjente posisjon'):movementText(shown)}</div>
      <div class="source">${shown.source||''}</div>
    </div>`;
    select(shown,false);
  }else{
    selected=null;
    $('status').textContent=`${planes.filter(withinKsuAlertArea).length} fly innen 50 NM · ${new Date().toLocaleTimeString('no-NO',{hour:'2-digit',minute:'2-digit'})}`;
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
if($('mode'))$('mode').onclick=toggleDisplay;
if($('notify'))$('notify').onclick=requestNotifications;
if($('proximity-sound'))$('proximity-sound').onclick=toggleProximitySound;
let refreshTimer=null;
function interpolatedPlanePosition(p,now=Date.now()){
  if(!p||!Number.isFinite(Number(p.lat))||!Number.isFinite(Number(p.lon)))return null;
  const gs=Number(p.gs);
  const tr=getTrackDeg(p);
  if(!Number.isFinite(gs)||gs<=0||tr===null)return [p.lat,p.lon];

  // Lost signals stay at the last fix. Ground tracks get only a short
  // prediction horizon: taxiing aircraft may stop or turn at any moment.
  if(p.signalLost)return [p.lat,p.lon];
  const ageSec=Math.max(0,(now-Number(p.positionAt||now))/1000);
  const ground=isGroundOrTaxi(p);
  const horizon=ground?3:20;
  const tail=ground?2:10;
  // Smoothly approach a bounded prediction distance, without an abrupt stop.
  const effectiveSec=ageSec<=horizon?ageSec:
    horizon+tail*(1-Math.exp(-(ageSec-horizon)/tail));
  return destinationPoint(p.lat,p.lon,gs*effectiveSec/3600,tr);
}
function rawLiveDistanceNm(p,now=Date.now()){
  if(!p)return null;
  const key=planeKey(p);
  const entry=key?motionMarkers.get(key):null;
  const pos=entry?motionPosition(entry,now):interpolatedPlanePosition(p,now);
  if(!pos)return Number.isFinite(Number(p.d))?nm(p.d):null;
  return nm(dist(63.1118,7.8245,pos[0],pos[1]));
}
function smoothedLiveDistanceNm(p,now=Date.now()){
  const target=rawLiveDistanceNm(p,now);
  if(target===null||!Number.isFinite(target))return null;

  const key=planeKey(p)||'selected';
  const old=liveDistanceState.get(key);
  if(!old){
    liveDistanceState.set(key,{value:target,at:now});
    return target;
  }

  const dt=Math.max(0.05,Math.min(2,(now-old.at)/1000));
  const gs=Number(p.gs);
  const physicalRate=Number.isFinite(gs)&&gs>0 ? gs/3600 : 0.03;
  // Tillat litt ekstra korreksjon mot ny ADS-B-posisjon, men unngå synlige hopp.
  const maxRate=Math.max(0.03,physicalRate*1.18);
  const maxStep=maxRate*dt;
  const diff=target-old.value;
  const step=Math.max(-maxStep,Math.min(maxStep,diff));
  const value=old.value+step;

  liveDistanceState.set(key,{value,at:now});
  return value;
}
function liveDistanceText(p,now=Date.now()){
  // Show the measured KSU distance, not the animation-smoothed value.
  const d=ksuDistanceNm(p);
  return Number.isFinite(d)?d.toFixed(1)+' NM':'–';
}
function motionPosition(entry,now){
  const target=interpolatedPlanePosition(entry.plane,now);
  if(!target||!entry.offset)return target;
  const t=Math.max(0,Math.min(1,(now-entry.correctedAt)/3000));
  const remaining=1-t*t*(3-2*t);
  return [target[0]+entry.offset[0]*remaining,target[1]+entry.offset[1]*remaining];
}
let lastMotionFrame=null;
let lastLiveDistancePaint=0;
function animateAircraftMotion(frameAt){
  requestAnimationFrame(animateAircraftMotion);
  if(document.hidden){lastMotionFrame=null;return;}
  const dt=lastMotionFrame===null?0:Math.min(0.1,(frameAt-lastMotionFrame)/1000);
  lastMotionFrame=frameAt;
  const now=Date.now();
  for(const entry of motionMarkers.values()){
    const pos=motionPosition(entry,now);
    if(pos)entry.marker.setLatLng(pos);
    const heading=getTrackDeg(entry.plane)??entry.heading;
    const turn=((heading-entry.heading+540)%360)-180;
    entry.heading=(entry.heading+turn*(1-Math.exp(-dt/0.5))+360)%360;
    const icon=entry.marker.getElement()?.querySelector('.plane-marker');
    if(icon)icon.style.transform=`rotate(${entry.heading}deg)`;
  }

  // Oppdater NM-visningen jevnt mellom nye ADS-B-fikser, uten ekstra API-kall.
  if(now-lastLiveDistancePaint>=200){
    lastLiveDistancePaint=now;

    if(selected){
      const liveText=liveDistanceText(selected,now);
      const cardDist=document.querySelector('.aircraft-card .dist');
      if(cardDist)cardDist.textContent=liveText;
      if($('hdist'))$('hdist').textContent=liveText;
    }

    let closest=Infinity;
    for(const p of planes){
      if(p.signalLost)continue;
      const d=smoothedLiveDistanceNm(p,now);
      if(d!==null&&d<closest)closest=d;
    }
    const closestText=Number.isFinite(closest)?closest.toFixed(1)+' NM':'–';
    if($('closest'))$('closest').textContent=closestText;
    if($('fs-closest'))$('fs-closest').textContent=closestText;
  }
}
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

  const approachKsu=planes.find(p=>ksuApproachContext(p));
  if(approachKsu){
    const ctx=ksuApproachContext(approachKsu);
    if(ctx?.dNm<=15)return 5000;
    if(ctx?.dNm<=35)return 10000;
    return 15000;
  }

  const trackedKsu=planes.find(p=>confirmedKsuArrival(p)&&ksuDistanceNm(p)<=12);
  if(trackedKsu){
    const d=ksuDistanceNm(trackedKsu);
    const gs=Number(trackedKsu.gs);
    const alt=Number(trackedKsu.alt);
    if(d<=3.5 && (!Number.isFinite(gs)||gs<=80) && (!Number.isFinite(alt)||alt<=2500))return 3000;
    if(d<=6)return 5000;
    return 10000;
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
setInterval(renderAvinor,30000);
loadAvinor();loadOffshore();loadVessels();adaptiveRefresh();setInterval(loadAvinor,600000);setInterval(loadVessels,30000);requestAnimationFrame(animateAircraftMotion);
setInterval(()=>{
  if(document.hidden)return;
  focusIdleCandidate(planes,true);
},2000);
document.addEventListener('fullscreenchange',()=>{
  setTimeout(()=>{
    try{
      map.invalidateSize(true);
      if(planes.length)fitMap(planes,settings());
    }catch(e){}
  },120);
});
if('serviceWorker' in navigator){navigator.serviceWorker.register('./sw.js').catch(()=>{});}

