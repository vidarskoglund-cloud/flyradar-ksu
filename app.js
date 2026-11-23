const $=x=>document.getElementById(x);
let planes=[], localPlanes=[], remoteKsuPlanes=[], vessels=[], display=false, selected=null, avinorFlights=[], lastGoodPlanes=[], sourceState={adsb:'ukjent',apl:'ukjent',fi:'ukjent'};
let idleFocusIndex=0;
const trackHistory=new Map();
const TRACK_STORE_KEY='flyradar-ksu-trails-v1';
const TRACK_KEEP_MS=30*60*1000;
const TRACK_MAX_POINTS=140;
function validTrackPoint(p,cutoff,now){
 const lat=Number(p?.lat),lon=Number(p?.lon),t=Number(p?.t);
 return Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180&&Number.isFinite(t)&&t>=cutoff&&t<=now+10000;
}
function restoreTrackHistory(){
 try{
  const now=Date.now(),cutoff=now-TRACK_KEEP_MS;
  const saved=JSON.parse(localStorage.getItem(TRACK_STORE_KEY)||'[]');
  if(!Array.isArray(saved))return;
  for(const x of saved.slice(0,70)){
   if(!x||!/^[a-z0-9-]{1,35}$/.test(x.key)||!Array.isArray(x.points))continue;
   const points=x.points.filter(p=>validTrackPoint(p,cutoff,now)).slice(-TRACK_MAX_POINTS);
   if(points.length)trackHistory.set(x.key,points);
  }
 }catch(e){console.warn('Kunne ikke lese flyspor',e);}
}
function persistTrackHistory(){
 try{
  const now=Date.now(),cutoff=now-TRACK_KEEP_MS;
  const saved=[...trackHistory].map(([key,points])=>({key,points:points.filter(p=>validTrackPoint(p,cutoff,now)).slice(-TRACK_MAX_POINTS)}))
   .filter(x=>x.points.length&&/^[a-z0-9-]{1,35}$/.test(x.key))
   .sort((x,y)=>y.points.at(-1).t-x.points.at(-1).t).slice(0,70);
  localStorage.setItem(TRACK_STORE_KEY,JSON.stringify(saved));
 }catch(e){console.warn('Kunne ikke lagre flyspor',e);}
}
restoreTrackHistory();
const routeCache=new Map();
const routeAttempts=new Map();
const routeRequests=new Set();
const aircraftRouteCache=new Map();
const ROUTE_STORAGE_KEY='flyradar-ksu-confirmed-routes-v1';
const ROUTE_TTL_MS=24*60*60*1000;
const ROUTE_MAX_ENTRIES=250;
function routeDay(now=Date.now()){return new Date(now).toISOString().slice(0,10);}
function flightRouteKey(p,now=Date.now()){
  const flight=String(p?.flight||'').trim().toUpperCase();
  return flight?routeDay(now)+'|'+flight:'';
}
function loadSavedRoutes(){
  try{
    const stored=JSON.parse(localStorage.getItem(ROUTE_STORAGE_KEY)||'[]');
    if(!Array.isArray(stored))return;
    const now=Date.now();
    for(const item of stored){
      if(!item||typeof item.key!=='string'||!item.route||typeof item.route!=='object')continue;
      if(!Number.isFinite(item.savedAt)||item.savedAt>now||now-item.savedAt>ROUTE_TTL_MS)continue;
      if(!item.key.startsWith(routeDay(now)+'|'))continue;
      routeCache.set(item.key,item.route);
      aircraftRouteCache.set(item.key,item.route);
    }
  }catch(e){console.warn('Kunne ikke lese lagrede flyruter:',e);}
}
function saveConfirmedRoute(p,route){
  if(!route||typeof route!=='object')return;
  const key=flightRouteKey(p);
  if(!key)return;
  routeCache.set(key,route);
  aircraftRouteCache.set(key,route);
  try{
    const now=Date.now();
    const saved=JSON.parse(localStorage.getItem(ROUTE_STORAGE_KEY)||'[]');
    const entries=Array.isArray(saved)?saved.filter(item=>
      item&&item.key!==key&&item.route&&Number.isFinite(item.savedAt)&&
      item.savedAt<=now&&now-item.savedAt<ROUTE_TTL_MS&&
      item.key.startsWith(routeDay(now)+'|')):[];
    entries.push({key,route,savedAt:now});
    localStorage.setItem(ROUTE_STORAGE_KEY,JSON.stringify(entries.slice(-ROUTE_MAX_ENTRIES)));
  }catch(e){console.warn('Kunne ikke lagre bekreftet flyrute:',e);}
}
loadSavedRoutes();
const recentPlaneCache=new Map();
const remoteKsuIdentityCache=new Map();
const ksuLastKnownCache=new Map();
const liveDistanceState=new Map();
const LOST_SIGNAL_KEEP_MS=3*60*1000;
const KSU_LOST_SIGNAL_KEEP_MS=2*60*1000;
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
let vesselGuideLayer=L.layerGroup().addTo(map); // AIS guide overlays

// DATEX traffic notices: separate Leaflet pane keeps existing aircraft/AIS
// markers and map movement untouched. Only geocoded road messages get pins.
map.createPane('trafficNoticePane');
map.getPane('trafficNoticePane').style.zIndex='625';
let trafficNoticeLayer=L.layerGroup().addTo(map);
let currentTrafficNotices=[];
function safeTrafficText(s){
  return String(s == null ? '' : s).replace(/[&<>"']/g,ch=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));
}
function trafficKind(event){
  const message=String(event?.message||'').toLowerCase();
  const type=String(event?.type||'').toLowerCase();
  const validity=String(event?.validity||'').toLowerCase();
  const now=Date.now();
  const started=event?.start?Date.parse(event.start):NaN;
  const ended=event?.end?Date.parse(event.end):NaN;
  // Red is reserved for explicit closures with a currently valid time window.
  const confirmed=validity==='active' && (!Number.isFinite(started)||started<=now) &&
    (!Number.isFinite(ended)||ended>=now);
  if(confirmed && /(?:stengt|stengning|closed|road\s*closed)/i.test(message))return 'closed';
  if(/(?:veg(?:-| )?arbeid|veiarbeid|diriger|vedlikehold)/i.test(message) ||
     /maintenance|roadworks/i.test(type))return 'work';
  return 'info';
}
function renderTrafficNotices(){
  trafficNoticeLayer.clearLayers();
  // Prevent road pins from cluttering national overview/aircraft tracking.
  if(map.getZoom()<9)return;
  for(const event of currentTrafficNotices){
    const lat=Number(event.lat),lon=Number(event.lon);
    if(!Number.isFinite(lat)||!Number.isFinite(lon)||
       lat<62.9||lat>63.35||lon<7.35||lon>8.6)continue;
    const kind=trafficKind(event);
    const symbol=kind==='closed'?'⛔':kind==='work'?'⚠':'i';
    const label=kind==='closed'?'Stengning':kind==='work'?'Vegarbeid':'Trafikkmelding';
    const icon=L.divIcon({
      className:'traffic-notice-icon',
      html:'<span class="traffic-notice-marker traffic-notice-'+kind+'" aria-label="'+label+'">'+symbol+'</span>',
      iconSize:[30,32],iconAnchor:[15,32],popupAnchor:[0,-26]
    });
    const details=[
      '<strong>'+safeTrafficText(label)+'</strong>',
      '<div>'+safeTrafficText(event.place||'Kristiansund')+'</div>',
      event.message?'<div>'+safeTrafficText(event.message)+'</div>':'',
      event.start?'<div>Fra: '+safeTrafficText(event.start)+'</div>':'',
      event.end?'<div>Til: '+safeTrafficText(event.end)+'</div>':'',
      '<small>Registrert i DATEX. Aktiv status ikke bekreftet.</small>',
      '<small>Kilde: Statens vegvesen DATEX II</small>'
    ].filter(Boolean).join('');
    L.marker([lat,lon],{icon,pane:'trafficNoticePane',zIndexOffset:450,
      title:label+' – '+String(event.place||'')})
      .bindPopup('<div class="traffic-notice-popup">'+details+'</div>',{maxWidth:270})
      .addTo(trafficNoticeLayer);
  }
}
window.KsuTrafficMap={
  update(data){
    const dedupe=new Set();
    currentTrafficNotices=[];
    const events=[...Object.values(data?.roads||{}).flat(),...(data?.local||[])];
    for(const event of events){
      if(!Number.isFinite(Number(event?.lat))||!Number.isFinite(Number(event?.lon)))continue;
      const key=[Number(event.lat).toFixed(4),Number(event.lon).toFixed(4),
        String(event.place||'').trim().toLowerCase(),
        String(event.message||'').trim().toLowerCase()].join('|');
      if(dedupe.has(key))continue;
      dedupe.add(key);
      currentTrafficNotices.push(event);
    }
    renderTrafficNotices();
  }
};
map.on('zoomend',renderTrafficNotices);


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
    iconSize:isHome?[48,24]:[58,30],
    iconAnchor:isHome?[24,12]:[15,15]
  });
}
let home=L.marker([63.1118,7.8245],{
  icon:airportIcon('KSU','Kvernberget','home',true),
  zIndexOffset:900
}).bindTooltip('KSU / Kvernberget',{direction:'top'}).addTo(map);
function updateHomeAirportMarker(){
  const zoom=map.getZoom();
  if(zoom>=13){
    if(map.hasLayer(home))map.removeLayer(home);
    return;
  }
  if(!map.hasLayer(home))home.addTo(map);
  home.setIcon(airportIcon('KSU','Kvernberget','home',true));
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
    const nearKsuOnGround=ksuDistanceNm(entry.plane)<=3.5 && isGroundOrTaxi(entry.plane);
    const keepMs=(entry.plane.ksuFlight||nearKsuOnGround)?KSU_LOST_SIGNAL_KEEP_MS:LOST_SIGNAL_KEEP_MS;
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

  if(p.signalLost&&ageSec>=60)return {label:'Siste kjente posisjon ved KSU',ageSec};
  return {label:'På bakken ved KSU',ageSec};
}

function signalStateText(p){
  if(!p?.signalLost)return '';
  const ageSec=Math.max(0,Math.round((Date.now()-(p.lastSeenAt||Date.now()))/1000));
  const parked=ksuParkedState(p);
  if(parked)return parked.label;
  if(ksuDistanceNm(p)<=3.5 && isGroundOrTaxi(p))return `Siste kjente posisjon ved KSU · signal mistet for ${ageSec<60?ageSec+' sek':Math.round(ageSec/60)+' min'} siden`;
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
    u.searchParams.set('callsign',callsign);
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
    const url=`https://api.adsb.lol/v2/point/${origin.lat}/${origin.lon}/25`;
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
    const url=`https://api.adsb.lol/v2/point/${ksu.lat}/${ksu.lon}/25`;
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

      const p=normalize({...raw,_source:'adsb.lol · KSU fjernsporing'},s);
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
  const routeDayKey=flightRouteKey({flight});
  const cachedRoute=cachedAircraftRoute({flight});
  const previousRoute=previous?.routeDayKey===routeDayKey?previous.routeData:null;
  const routeData=cachedRoute||previousRoute||null;
  const route=routeData?routeText(routeData):null;

  return{
    hex:a.hex||'',flight,reg:a.r||'',type:a.t||'',
    operator:a.ownOp||a.operator||'',desc:a.desc||'',lat,lon,
    alt:Number.isFinite(Number(a.alt_baro??a.alt_geom))?Number(a.alt_baro??a.alt_geom):a.alt_baro??a.alt_geom,gs:Number.isFinite(Number(a.gs))?Number(a.gs):a.gs,track:Number.isFinite(Number(a.track??a.true_heading??a.mag_heading))?Number(a.track??a.true_heading??a.mag_heading):a.track??a.true_heading??a.mag_heading,
    vr:a.baro_rate??a.geom_rate,d:dist(s.lat,s.lon,lat,lon),route,routeData,routeDayKey,source:a._source||'Kombinerte data (Worker)',
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
function cachedAircraftRoute(p){
  const key=flightRouteKey(p);
  return key?(aircraftRouteCache.get(key)||routeCache.get(key)||null):null;
}
function rememberAircraftRoute(p,r){
  if(!r)return;
  saveConfirmedRoute(p,r);
}

function ingestSharedTracks(shared){
  if(!shared||typeof shared!=='object')return false;
  const cutoff=Date.now()-TRACK_KEEP_MS;
  let used=false;
  for(const [key,points] of Object.entries(shared)){
    if(!Array.isArray(points))continue;
    const fresh=points
      .map(x=>({lat:Number(x.lat),lon:Number(x.lon),t:Number(x.t)}))
      .filter(x=>Number.isFinite(x.lat)&&Number.isFinite(x.lon)&&Number.isFinite(x.t)&&x.t>=cutoff);
    if(fresh.length){
      const k=String(key).toLowerCase();
      const existing=trackHistory.get(k)||[];
      const combined=[...existing,...fresh].sort((a,b)=>a.t-b.t);
      trackHistory.set(k,combined.filter((x,i)=>i===0||x.t!==combined[i-1].t).slice(-TRACK_MAX_POINTS));
      used=true;
    }
  }
  if(used)persistTrackHistory();
  return used;
}
function updateTrackHistory(list){
  const now=Date.now();
  const keepMs=TRACK_KEEP_MS;
  const active=new Set();
  list.forEach(p=>{
    const key=planeKey(p);
    if(!key||p.signalLost||!Number.isFinite(p.lat)||!Number.isFinite(p.lon))return;
    active.add(key);
    const arr=trackHistory.get(key)||[];
    const last=arr[arr.length-1];
    if(!last || dist(last.lat,last.lon,p.lat,p.lon)>0.05 || now-last.t>15000){
      arr.push({lat:p.lat,lon:p.lon,t:now});
    }
    const fresh=arr.filter(x=>now-x.t<=keepMs);
    trackHistory.set(key,fresh.slice(-TRACK_MAX_POINTS));
  });
  for(const [key,arr] of trackHistory){
    const fresh=arr.filter(x=>now-x.t<=keepMs);
    if(fresh.length)trackHistory.set(key,fresh.slice(-TRACK_MAX_POINTS)); else trackHistory.delete(key);
  }
  persistTrackHistory();
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
  const now=Date.now();
  const hist=(trackHistory.get(key)||[]).filter(x=>now-x.t<=TRACK_KEEP_MS);
  if(hist.length>=2){
    L.polyline(hist.map(x=>[x.lat,x.lon]),{
      weight:4,
      opacity:.85
    }).bindTooltip('Faktisk flyspor · siste 30 min',{sticky:true}).addTo(trackLayer);
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
  // Heading alone does not establish an approach to KSU.
  const confirmedArrival=confirmedKsuArrival(p);
  if(confirmedArrival&&distanceNm<=100&&headingToKsu!==null&&headingToKsu<=75){
    return {label:'På vei til KSU',detail:'Bekreftet KSU-destinasjon'};
  }
  if(!confirmedArrival && distanceNm<=25 && Number.isFinite(alt) && alt<=10000 &&
     descending && approachingByTrend && headingToKsu!==null && headingToKsu<=55){
    return {label:'Mulig innflyging mot KSU',detail:'Basert på bevegelse og nedstigning'};
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
  if(!confirmedArrival&&distanceNm>25){
    return {label:'Passerer regionen',detail:tr!==null?'kurs '+Math.round(tr)+'°':''};
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
  const rings=[25,50,100];
  rings.forEach(n=>{
    const isAlert=n===50;
    const isLookup=n===25;
    L.circle([s.lat,s.lon],{
      radius:n*1852,
      color:'#ff5c5c',
      weight:isAlert?2.2:1.6,
      opacity:isAlert?0.82:0.72,
      fill:false,
      dashArray:isAlert?'7 8':'4 7',
      interactive:false,
      pane:'rangePane'
    }).addTo(rangeLayer);

    const pos=destinationPoint(s.lat,s.lon,n,0);
    const label=n+' NM';
    L.marker(pos,{interactive:false,pane:'rangePane',icon:L.divIcon({
      className:'range-label-wrap',
      html:`<div class="range-label alert-zone">${label}</div>`,
      iconSize:[54,17],iconAnchor:[27,8]
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
map.on('dragstart',()=>{manualMapUntil=Date.now()+120000;idleViewStartedAt=null;idleViewPhase=-1;updateMapFocusStatus();});
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
// Automatisk kartfokus: KSU-fly foran lokaltrafikk, deretter fartøy nær byen.
let smartMapTarget=null, smartMapChangedAt=0, autoMapTransition=false;
let smartMapLastTrafficAt=0,smartMapLastMoveAt=0;
const SMART_MAP_RETURN_DELAY_MS=25000;
const SMART_MAP_MOVE_COOLDOWN_MS=12000;

/* Header status describes the actual automatic map target, not the aircraft
   remembered in the information panel. Counts are shown in the stats row. */
function mapFocusStatusText(now=Date.now()){
  if(now<manualMapUntil)return 'Kartvisning valgt manuelt';
  const key=String(smartMapTarget?.key||'');
  if(key.startsWith('bat:')){
    const id=key.slice(4);
    const vessel=vessels.find(v=>vesselKey(v)===id);
    if(vessel&&Number.isFinite(Number(vessel.lat))&&Number.isFinite(Number(vessel.lon)))
      return 'Følger fartøy '+(vessel.name||('MMSI '+(vessel.mmsi||'ukjent')));
  }
  const flightKey=key.startsWith('fly:')?key.slice(4):
    key.startsWith('glimt:fly:')?key.slice('glimt:fly:'.length):'';
  if(flightKey){
    const p=planes.find(p=>smartPlaneIdentity(p).slice(4)===flightKey&&!p.signalLost);
    if(p){
      const label=p.flight||p.reg||p.hex||'ukjent';
      if(key.startsWith('glimt:')&&p.ksuFlight?.arr_dep==='A'&&
         ['OSL','BGO'].includes(String(p.ksuFlight.airport||'').toUpperCase()))
        return 'Viser KSU-ankomst fra '+p.ksuFlight.airport+': '+label;
      if(key.startsWith('glimt:')){
        const nearby=IDLE_NEARBY_AIRPORTS.map(a=>({a,d:idleAirportDistanceNm(a.lat,a.lon,Number(p.lat),Number(p.lon))}))
          .find(x=>x.d<=12);
        return nearby?'Viser fly ved '+nearby.a.label+': '+label:'Viser fly '+label;
      }
      return 'Følger fly '+label;
    }
  }
  return 'Oversikt Kristiansund';
}
function updateMapFocusStatus(now=Date.now()){
  if(document.body.dataset.liveSource!=='direct')return;
  const value=mapFocusStatusText(now)+' · '+
    new Date(now).toLocaleTimeString('no-NO',{hour:'2-digit',minute:'2-digit'});
  if($('status')){$('status').textContent=value;$('status').className='ok';}
  if($('fs-status'))$('fs-status').textContent=value;
}

// A brief, low-priority view of a distant aircraft when local traffic is quiet.
const IDLE_GLIMPSE_CYCLE_MS=90000;
const IDLE_GLIMPSE_FROM_MS=60000;
const IDLE_GLIMPSE_TO_MS=75000;
let idleGlimpseSince=null;
const smartGroundStillSince=new Map();
const SMART_MAP_HOLD_MS=30000;
const SMART_MAP_MANUAL_MS=120000;
function smartPlaneIdentity(p){
  return 'fly:'+(planeKey(p)||p.hex||p.flight||p.reg||'ukjent');
}
function smartMapCandidate(list){
  const active=(list||[]).filter(p=>!p.signalLost &&
    Number.isFinite(Number(p.lat))&&Number.isFinite(Number(p.lon)));
  const choices=[];
  for(const p of active){
    const d=ksuDistanceNm(p);
    if(!Number.isFinite(d))continue;
    const info=ksuFlightInfo(p);
    const arrival=confirmedKsuArrival(p)&&info?.status!=='Innstilt';
    const departure=info?.direction==='Avgang KSU'&&info.status!=='Innstilt';
    const approach=arrival?ksuApproachContext(p):null;
    const heading=getTrackDeg(p);
    const bearing=bearingBetween(p.lat,p.lon,63.1118,7.8245);
    const towardKsu=heading!==null&&angleDiff(heading,bearing)<=75;
    // Helikoptre og fly uten Avinor-kobling kan likevel ha bekreftet
    // bevegelse mot KSU i ADS-B-sporet. Ikke krev registrert rutetreff.
    // ksuMovementStatus bruker kurs og historisk avstandsendring.
    const motion=ksuMovementStatus(p).label;
    const inboundByMotion=(motion==='Nærmer seg KSU' ||
      motion==='Ser ut til å være på innflyging') && towardKsu && d<=100;
    const low=Number(p.alt);
    const speed=Number(p.gs);
    const groundLike=d<=3.5&&isGroundOrTaxi(p);
    // Skille aktiv taksing fra et luftfartoy som har sluttet a bevege seg.
    // Manglende eller gammel ADS-B-posisjon er aldri dokumentert parkering.
    const key=smartPlaneIdentity(p);
    const stopped=groundLike&&Number.isFinite(speed)&&speed<=5;
    const still=smartGroundStillSince.get(key);
    if(stopped){
      if(!still || nm(dist(still.lat,still.lon,p.lat,p.lon))>0.1){
        smartGroundStillSince.set(key,{lat:p.lat,lon:p.lon,since:Date.now()});
      }
    }else smartGroundStillSince.delete(key);
    const stationary=stopped&&smartGroundStillSince.has(key)&&
      Date.now()-smartGroundStillSince.get(key).since>=2*60*1000;
    const finalApproach=d<=5&&Number.isFinite(low)&&low<=3500&&
      !groundLike&&(arrival||inboundByMotion);
    let rank=0;
    if(groundLike&&!stationary)rank=6;
    else if(finalApproach)rank=5.5;
    else if(arrival&&d<=100&&(approach||d<=50))rank=5;
    else if(departure&&d<=25&&!stationary)rank=4;
    else if(inboundByMotion&&d<=50)rank=3.5;
    else if(d<=25&&!stationary)rank=d<=10?3.2:3;
    else if(inboundByMotion)rank=2.5;
    else if(arrival&&d<=100&&towardKsu)rank=2.5;
    // Give explicitly classified special flights a modest local focus boost.
    // Confirmed KSU operations (rank 5–6) continue to take precedence.
    const role=specialFlightCategory(p);
    if(role&&d<=50)rank=Math.max(rank,role.rank);
    if(!rank)continue;
    // Nar luftfartoyet er pa bakken skal kartet folge posisjonen,
    // ikke presse hele flyplassomradet inn i samme bilde.
    const closeGround=groundLike&&d<=2;
    choices.push({
      key,rank,d,
      points:closeGround
        ?[[p.lat-0.002,p.lon-0.003],[p.lat+0.002,p.lon+0.003]]
        :[[63.1118,7.8245],[p.lat,p.lon]],
      maxZoom:groundLike?16:
        finalApproach?(d<=1?16:d<=2.5?15:14):
        rank>=5?(d<=8?12:d<=25?10:d<=50?9:7):
        rank>=3.5?(d<=8?12:d<=25?10:9):
        rank>=3?(d<=10?12:10):7
    });
  }
  // Fokus på AIS-bevegelse i havnen og inn-/utseiling, men aktive fly prioriteres.
  for(const v of vessels){
    const m=movingHarborVessel(v);
    if(!m)continue;
    choices.push({
      key:'bat:'+m.key,rank:m.rank,d:m.d,
      // Show Kristiansund harbour and the moving vessel, not the KSU runway.
      points:[[VESSEL_HARBOR_CENTER[0],VESSEL_HARBOR_CENTER[1]],[m.lat,m.lon]],
      maxZoom:m.inHarbor?13:m.d<=3.5?12:11
    });
  }
  choices.sort((a,b)=>b.rank-a.rank||a.d-b.d);
  return choices;
}
// Limited secondary interest near the three closest regional airports.
const IDLE_NEARBY_AIRPORTS=[
 {code:'MOL',label:'Molde Årø',lat:62.7447,lon:7.2625},
 {code:'AES',label:'Ålesund Vigra',lat:62.5625,lon:6.1197},
 {code:'TRD',label:'Trondheim Værnes',lat:63.4578,lon:10.9240}
];
function idleAirportDistanceNm(lat1,lon1,lat2,lon2){
 const radian=n=>n*Math.PI/180;
 const dlat=radian(lat2-lat1),dlon=radian(lon2-lon1);
 const a=Math.sin(dlat/2)**2+Math.cos(radian(lat1))*Math.cos(radian(lat2))*Math.sin(dlon/2)**2;
 return 3440.065*2*Math.asin(Math.min(1,Math.sqrt(a)));
}
function idleInboundKsu(p){
 const f=p.ksuFlight;
 if(!f||f.arr_dep!=='A'||!['OSL','BGO'].includes(String(f.airport||'').toUpperCase()))return false;
 if(['C','A'].includes(String(f.status_code||'').toUpperCase()))return false;
 // Never infer that a nearby passing aircraft is an Oslo/Bergen service.
 // Require existing remote KSU tracking or an exact Avinor callsign alias.
 const exact=typeof flightAliases==='function'&&
   [...flightAliases(p.flight)].some(x=>flightAliases(f.flight_id).has(x));
 if(!p.remoteTracked&&!exact)return false;
 const dest=typeof confirmedRouteDestination==='function'?confirmedRouteDestination(p):null;
 if(dest&&dest.code&&dest.code!=='KSU')return false;
 if(!(Number(p.gs)>95)||String(p.alt||'').toLowerCase()==='ground')return false;
 const airport=String(f.airport).toUpperCase()==='OSL'
   ?[60.1939,11.1004]:[60.2934,5.2181];
 const fromOrigin=idleAirportDistanceNm(airport[0],airport[1],Number(p.lat),Number(p.lon));
 const ksu=ksuDistanceNm(p);
 return fromOrigin>3&&Number.isFinite(ksu)&&ksu>25&&ksu<=350;
}
function idleAircraftGlimpse(list,now){
 const active=(list||[]).filter(p=>!p.signalLost&&
   Number.isFinite(Number(p.lat))&&Number.isFinite(Number(p.lon))&&
   Number.isFinite(ksuDistanceNm(p))&&ksuDistanceNm(p)>25);
 const remote=active.filter(idleInboundKsu)
   .sort((a,b)=>ksuDistanceNm(a)-ksuDistanceNm(b));
 const neighboring=[];
 for(const airport of IDLE_NEARBY_AIRPORTS){
  const nearby=active.filter(p=>ksuDistanceNm(p)<=125)
    .map(p=>({p,d:idleAirportDistanceNm(airport.lat,airport.lon,Number(p.lat),Number(p.lon))}))
    .filter(row=>row.d<=12)
    .sort((a,b)=>a.d-b.d)[0];
  if(nearby)neighboring.push({...nearby,airport});
 }
 const general=active.filter(p=>ksuDistanceNm(p)<=120)
   .sort((a,b)=>ksuDistanceNm(a)-ksuDistanceNm(b));
 if(!remote.length&&!neighboring.length&&!general.length){
   idleGlimpseSince=null;return null;
 }
 if(idleGlimpseSince===null)idleGlimpseSince=now;
 const elapsed=now-idleGlimpseSince,phase=elapsed%IDLE_GLIMPSE_CYCLE_MS;
 if(phase<IDLE_GLIMPSE_FROM_MS||phase>=IDLE_GLIMPSE_TO_MS)return null;
 // Alternate between confirmed KSU arrivals from OSL/BGO and nearby
 // regional airport activity. Never let secondary views displace KSU/AIS.
 const cycle=Math.floor(elapsed/IDLE_GLIMPSE_CYCLE_MS);
 const remoteFirst=cycle%2===0;
 const near=neighboring[0]||null,flight=remote[0]||null;
 if(remoteFirst&&flight || !near&&flight){
  return {key:'glimt:'+smartPlaneIdentity(flight),rank:0.7,d:ksuDistanceNm(flight),
    points:[[63.1118,7.8245],[flight.lat,flight.lon]],
    maxZoom:8,secondary:'ksu-inbound'};
 }
 if(near){
  return {key:'glimt:'+smartPlaneIdentity(near.p),rank:0.6,d:ksuDistanceNm(near.p),
    points:[[near.airport.lat,near.airport.lon],[near.p.lat,near.p.lon]],
    maxZoom:11,secondary:'near-airport',airportLabel:near.airport.label};
 }
 const p=flight||general[0];
 return {key:'glimt:'+smartPlaneIdentity(p),rank:0.5,d:ksuDistanceNm(p),
   points:[[mapAreas.city.lat,mapAreas.city.lon],[p.lat,p.lon]],maxZoom:9};
}
function fitMap(list,s){
  const now=Date.now();
  if(now<manualMapUntil)return;
  const candidates=smartMapCandidate(list);
  const best=candidates[0]||null;
  // KSU-fly og aktive havnefartøy har alltid forrang over fjerntrafikk.
  if(best)idleGlimpseSince=null;
  const glimpse=!best?idleAircraftGlimpse(list,now):null;
  const current=candidates.find(x=>x.key===smartMapTarget?.key)||null;
  let target=best||glimpse;
  // Ikke kast bort det lokale kartutsnittet ved kortvarig tap av fly/AIS.
  if(best)smartMapLastTrafficAt=now;
  const focusedOffscreen=selected&&!selectedVesselTypeKey&&!selected.signalLost&&
    Number.isFinite(Number(selected.lat))&&Number.isFinite(Number(selected.lon))&&
    !map.getBounds().pad(-0.06).contains([Number(selected.lat),Number(selected.lon)]);
  if(!best&&!glimpse&&!focusedOffscreen&&smartMapTarget?.key!=='normal'&&
     !String(smartMapTarget?.key).startsWith('glimt:')&&
     now-smartMapLastTrafficAt<SMART_MAP_RETURN_DELAY_MS)return;
  // Hold på samme mål i minst 30 sekunder, unntatt høyere prioritet.
  if(current&&best&&current.key!==best.key&&
     now-smartMapChangedAt<SMART_MAP_HOLD_MS&&best.rank<=current.rank){
    target=current;
  }
  const targetChanged=smartMapTarget?.key!==(target?.key||'normal');
  if(!target){
    if(smartMapTarget?.key!=='normal'){
      smartMapTarget={key:'normal',rank:0};
      smartMapChangedAt=now;
    }
  }else if(smartMapTarget?.key!==target.key){
    smartMapTarget={key:target.key,rank:target.rank};
    smartMapChangedAt=now;
  }
  const bounds=target
    ?L.latLngBounds(target.points)
    :areaBounds(mapAreas.city.lat,mapAreas.city.lon,22);
  const maxZoom=target?target.maxZoom:10;
  const padding=target?[65,65]:[28,28];
  // Keep the aircraft shown in the detail panel visible too. If it is outside
  // the current focus bounds, zoom OUT to include both it and the local view.
  // Never override the two-minute pause after manual map interactions.
  const focused=selectedVesselTypeKey?'':selected&&list.find(p=>
    planeKey(p)===planeKey(selected)&&!p.signalLost&&
    Number.isFinite(Number(p.lat))&&Number.isFinite(Number(p.lon)));
  const glimpseTarget=Boolean(target?.key?.startsWith('glimt:'));
  const focusedPoint=focused&&(!glimpseTarget||smartPlaneIdentity(focused)===target.key.slice(6))
    ?[Number(focused.lat),Number(focused.lon)]:null;
  if(focusedPoint&&!bounds.contains(focusedPoint))bounds.extend(focusedPoint);
  const wantedZoom=Math.min(maxZoom,map.getBoundsZoom(bounds,false,L.point(padding[0]*2,padding[1]*2)));
  const inside=map.getBounds().pad(-0.08);
  const focusedOutside=Boolean(focusedPoint&&!inside.contains(focusedPoint));
  const pointsVisible=target?target.points.every(pos=>inside.contains(pos)):
    inside.contains(bounds.getNorthEast())&&inside.contains(bounds.getSouthWest());
  if(pointsVisible&&!focusedOutside&&Math.abs(map.getZoom()-wantedZoom)<=1)return;
  // An off-screen focused aircraft should not wait for the normal cooldown;
  // other automatic framing still honors the normal focus hold.
  if(target&&!targetChanged&&!focusedOutside&&
    now-smartMapLastMoveAt<SMART_MAP_MOVE_COOLDOWN_MS&&target.d>5)return;
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  autoMapTransition=true;
  const opts={padding,maxZoom,animate:!reduced,duration:2.2};
  smartMapLastMoveAt=now;
  map.once('moveend',()=>{autoMapTransition=false;});
  if(reduced)map.fitBounds(bounds,opts);
  else map.flyToBounds(bounds,opts);
}
// Brukerens zoom og panorering skal overstyre automatisk fokus i to minutter.
map.on('zoomstart',()=>{
  if(!autoMapTransition){manualMapUntil=Date.now()+SMART_MAP_MANUAL_MS;updateMapFocusStatus();}
});
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
  const militaryType=/^(C30J|C130|A400|C17|KC46|K35R|F16|F35|EUFI|HAWK|P3|P8|E3CF)$/.test(type);
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
function specialFlightCategory(p){
 if(!p)return null;
 const f=String(p.flight||'').toUpperCase().trim();
 const op=(String(p.operator||'')+' '+String(p.desc||'')).toLowerCase();
 // Explicit operational evidence is needed. An aircraft model such as GLF5
 // is not automatically military: the same type is used by civilian operators.
 if(f==='BNOV'||/\b(?:luftambulanse|air ambulance|air medical|air ambulance service)\b/.test(op))
   return {id:'ambulance',label:'Luftambulanse',rank:4.4};
 if(/^SAR(?:\d|$)|^RESCUE\b/.test(f)||/\b(?:search and rescue|redningshelikopter|redningstjeneste|rescue helicopter|sar mission)\b/.test(op))
   return {id:'rescue',label:'Redning / SAR',rank:4.8};
 if(/^POL(?:\d|$)/.test(f)||/\b(?:police|politi|politiets helikoptertjeneste)\b/.test(op))
   return {id:'police',label:'Politi',rank:4.5};
 if(/\b(?:coast guard|kystvakt|kystvakten)\b/.test(op))
   return {id:'coastguard',label:'Kystvakt',rank:4.3};
 if(militaryAircraftLabel(p))
   return {id:'military',label:'Militærfly',rank:4.2};
 if(/\b(?:civil defence|sivilforsvar|beredskapsfly)\b/.test(op))
   return {id:'preparedness',label:'Beredskap',rank:4.1};
 return null;
}
function specialService(p){
 const role=specialFlightCategory(p);
 if(role)return role.label;
 const op=(String(p?.operator||'')+' '+String(p?.desc||'')).toLowerCase();
 const f=String(p?.flight||'').toUpperCase();
 const type=String(p?.type||'').toUpperCase();
 if(/\b(?:offshore|chc helicopter)\b/.test(op)||/^HK[SM]/.test(f)||type==='S92')
   return 'Offshorehelikopter';
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
// Public flight card: show useful route state, never API eligibility/cost policy.
// Detailed source diagnostics belong on the administration page.
function routeLookupLabel(p){
  if(!p)return '';
  if(p.routeData)return '';
  if(p.routeLookupState==='trying')return 'Søker etter flyrute…';
  if(p.routeLookupState==='not-found')return 'Ingen bekreftet rute funnet';
  if(p.routeLookupState==='error')return 'Ruteinformasjon midlertidig utilgjengelig';
  return '';
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
  const key=flightRouteKey(p);
  if(!key||!routeLookupScope(p)||routeRequests.has(key)||cachedAircraftRoute(p))return false;
  const last=routeAttempts.get(key);
  if(!last)return true;
  // Entering paid-lookup eligibility must bypass an earlier free-only miss.
  const rank={ '':0,pilot25:0,local:1,zone25:1,active50:2,ksu:3 };
  return rank[routeLookupScope(p)]>rank[last.scope] || now-last.at>=5*60*1000;
}
async function enrichRoute(p){
  if(!p||!p.flight)return;
  const callsign=p.flight.trim();
  const key=flightRouteKey(p);
  const cached=cachedAircraftRoute(p);
  if(cached){
    const r=cached;
    p.routeData=r;
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
    if(r)rememberAircraftRoute(p,r);
    p.routeData=r;
    p.routeLookupSource=j?.source||'';
    p.routeLookupDiagnostics=j?.diagnostics||null;
    p.routeLookupState=r?'found':'not-found';
    p.route=routeText(r);
    if(selected&&selected.hex===p.hex)select(p,false);
  }catch(e){
    p.routeData=null;
    p.routeLookupState='error';
    p.routeLookupSource='';
    p.route='Rute ikke tilgjengelig';
    if(selected&&selected.hex===p.hex)select(p,false);
  }finally{
    routeRequests.delete(key);
  }
}
// Pilot: one free-only route lookup per distinct flight/date within 25 NM.
// Scope "pilot25-free" is deliberately not whitelisted for FlightAware in Worker.
// These counters are local to the browser; paid API accounting lives server-side.
const ROUTE25_PILOT_KEY='trafikkradar-route25-free-pilot-v1';
const ROUTE25_PILOT_LIMIT_PER_DAY=120;
const ROUTE25_PILOT_GAP_MS=15000;
let route25PilotBusy=false,route25PilotLastAt=0;
function route25PilotStats(now=Date.now()){
 const day=routeDay(now);
 let saved=null;
 try{saved=JSON.parse(localStorage.getItem(ROUTE25_PILOT_KEY)||'null')}catch(e){}
 if(!saved||saved.day!==day||!Array.isArray(saved.keys)){
   return {day,keys:[],attempts:0,found:0,noRoute:0,errors:0,paidCalls:0,estimatedUsd:0};
 }
 return saved;
}
function pilot25LookupStatus(p){
 const key=flightRouteKey(p);
 if(!key)return '';
 const stats=route25PilotStats();
 const outcome=stats.results?.[key];
 if(outcome==='found')return 'Gratis rutekontroll: rute funnet';
 if(outcome==='not-found')return 'Gratis rutekontroll utført · ingen bekreftet rute';
 if(outcome==='error')return 'Gratis rutekontroll mislyktes';
 if(stats.keys.includes(key))return 'Gratis rutekontroll forsøkt';
 if(!Number.isFinite(ksuDistanceNm(p))||ksuDistanceNm(p)>25)return '';
 if(stats.attempts>=ROUTE25_PILOT_LIMIT_PER_DAY)return 'Gratis rutekontroll: dagsgrense nådd';
 if(p.flight&&!p.signalLost&&!cachedAircraftRoute(p))return 'Gratis rutekontroll: venter på oppslag';
 return '';
}
function persistRoute25Pilot(stats){
 try{localStorage.setItem(ROUTE25_PILOT_KEY,JSON.stringify(stats))}catch(e){}
}
function pilot25Candidate(p,stats){
 const key=flightRouteKey(p);
 return Boolean(key && !p.signalLost && Number.isFinite(ksuDistanceNm(p)) &&
   ksuDistanceNm(p)<=25 && !stats.keys.includes(key) &&
   !routeRequests.has(key) && !cachedAircraftRoute(p));
}
async function runFreeRoutePilot25(list,now=Date.now()){
 if(route25PilotBusy||now-route25PilotLastAt<ROUTE25_PILOT_GAP_MS)return;
 const stats=route25PilotStats(now);
 if(stats.attempts>=ROUTE25_PILOT_LIMIT_PER_DAY)return;
 const p=(list||[]).filter(p=>pilot25Candidate(p,stats))
   .sort((a,b)=>ksuDistanceNm(a)-ksuDistanceNm(b))[0];
 if(!p)return;
 const key=flightRouteKey(p);
 const callsign=String(p.flight||'').trim().toUpperCase();
 stats.keys.push(key);
 stats.attempts++;
 persistRoute25Pilot(stats); // reserve before request to avoid repeated tests on failure
 route25PilotBusy=true;
 route25PilotLastAt=now;
 routeRequests.add(key);
 routeAttempts.set(key,{scope:'pilot25',at:now});
 try{
   const u=new URL('https://flyradar-ksu.vidar-skoglund.workers.dev/route');
   u.searchParams.set('callsign',callsign); // no date prefix in callsign sent to provider
   u.searchParams.set('lat',String(p.lat));
   u.searchParams.set('lon',String(p.lon));
   if(Number.isFinite(Number(p.alt)))u.searchParams.set('alt',String(p.alt));
   u.searchParams.set('fa_scope','pilot25-free'); // Worker cannot charge FlightAware for this scope
   const resp=await fetch(u,{cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(12000)});
   if(!resp.ok)throw new Error('HTTP '+resp.status);
   const data=await resp.json();
   // Do not silently accept a future Worker deployment that permits paid pilot traffic.
   if(data?.diagnostics?.flightaware_attempted===true)throw new Error('Pilot paid fallback unexpectedly attempted');
   const route=data?.route||null;
   p.routeLookupState=route?'found':'not-found';
   p.routeLookupSource=data?.source||'';
   p.routeLookupDiagnostics=data?.diagnostics||null;
   stats.results=stats.results||{};
   stats.results[key]=route?'found':'not-found';
   if(route){
     rememberAircraftRoute(p,route);
     p.routeData=route;
     p.route=routeText(route);
     stats.found++;
   }else{
     stats.noRoute++;
   }
   if(selected&&planeKey(selected)===planeKey(p)){
     // Keep the selection; update visible details without changing map focus.
     selected.routeData=p.routeData||null;
     selected.routeLookupState=p.routeLookupState;
     selected.routeLookupSource=p.routeLookupSource;
     selected.routeLookupDiagnostics=p.routeLookupDiagnostics;
     selected.route=p.route||'Rute ikke tilgjengelig';
     render(false);
   }
 }catch(e){
   stats.errors++;
   stats.results=stats.results||{};
   stats.results[key]='error';
   p.routeLookupState='error';
   console.warn('Gratis 25 NM rutetest feilet:',e);
 }finally{
   // Pilot never increments paidCalls or estimatedUsd; server owns real paid accounting.
   persistRoute25Pilot(stats);
   routeRequests.delete(key);
   route25PilotBusy=false;
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
  if(now<fiRescueRetryAfter || now-fiRescueLastAttempt<5000){
    return now-fiRescueLastSuccess<5000?fiRescueAircraft:null;
  }
  fiRescueLastAttempt=now;
  fiRescueDirectOk=false;
  try{
    const url='https://desktop-h4q75hk.tail5aa693.ts.net/aircraft';
    const response=await fetch(url,{cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(8000)});
    if(!response.ok){
      // Stop retrying on access denials and rate limits.
      if([400,401,403,404,429].includes(response.status)){
        fiRescueRetryAfter=Date.now()+(response.status===429?10:5)*60*1000;
      }
      throw new Error('HTTP '+response.status);
    }
    const data=await response.json();
    if(data.ok!==true)throw new Error('Flydataserveren er ikke klar');
const aircraft=data.ac||data.aircraft;
    if(!Array.isArray(aircraft))throw new Error('invalid aircraft payload');
    fiRescueAircraft=aircraft;
    fiRescueLastSuccess=Date.now();
    fiRescueError='';
    fiRescueDirectOk=true;
    return aircraft;
  }catch(error){
    fiRescueError=error?.name==='AbortError'||error?.name==='TimeoutError'?'Tidsavbrudd (8 sek)':error instanceof TypeError?'Nettverksfeil / mulig CORS-blokkering':String(error?.message||error);
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
    html:`<div class="vessel-marker${vesselKey(v)===selectedVesselTypeKey?' selected':''}" style="transform:rotate(${tr}deg)">▲</div>`,
    iconSize:[26,26],iconAnchor:[13,13]
  });
}
function vesselKind(v){
  const t=Number(v.shipType);
  if(t>=40&&t<=49)return 'Hurtiggående passasjerfartøy';
  if(t>=60&&t<=69)return 'Passasjerskip';
  return 'Skip';
}
// Rotate through nearby AIS vessels and show a live information popup.
let vesselFocusMmsi='',vesselFocusChangedAt=0,vesselLastFocusAt=0;
const vesselMarkers=new Map();
const vesselAnimation=new Map();
const VESSEL_TWEEN_MS=24000;
function vesselMotionFrame(now=Date.now()){
 for(const [key,entry] of vesselAnimation){
  const marker=vesselMarkers.get(key);
  if(!marker){vesselAnimation.delete(key);continue;}
  const fraction=Math.min(1,Math.max(0,(now-entry.started)/entry.duration));
  const t=fraction*fraction*(3-2*fraction);
  const lat=entry.from.lat+(entry.to.lat-entry.from.lat)*t;
  const lon=entry.from.lon+(entry.to.lon-entry.from.lon)*t;
  marker.setLatLng([lat,lon]);
  const turn=((entry.to.heading-entry.from.heading+540)%360)-180;
  const angle=(entry.from.heading+turn*t+360)%360;
  const icon=marker.getElement()?.querySelector('.vessel-marker');
  if(icon)icon.style.transform='rotate('+angle+'deg)';
  if(fraction>=1)vesselAnimation.delete(key);
 }
}
function vesselHeading(v){
 const heading=Number(v.heading),course=Number(v.course);
 const h=Number.isFinite(heading)&&heading>=0&&heading<360?heading:course;
 return Number.isFinite(h)&&h>=0&&h<360?h:0;
}
function scheduleVesselMotion(marker,key,v,now=Date.now()){
 const position=marker.getLatLng();
 const target={lat:Number(v.lat),lon:Number(v.lon),heading:vesselHeading(v)};
 if(!Number.isFinite(target.lat)||!Number.isFinite(target.lon))return;
 const icon=marker.getElement()?.querySelector('.vessel-marker');
 const previous=vesselAnimation.get(key);
 const oldHeading=previous?((previous.from.heading+
  ((previous.to.heading-previous.from.heading+540)%360-180)*
  Math.min(1,Math.max(0,(now-previous.started)/previous.duration)))+360)%360:vesselHeading(v);
 const from={lat:position.lat,lon:position.lng,heading:oldHeading};
 const distance=nm(dist(from.lat,from.lon,target.lat,target.lon));
 // Ignore repeated AIS fixes, reject implausible jumps and stop short of
 // extrapolating the vessel beyond its last confirmed AIS location.
 if(distance<0.002)return;
 if(distance>1.5){marker.setLatLng([target.lat,target.lon]);vesselAnimation.delete(key);return;}
 const speed=Number(v.speed);
 if(!Number.isFinite(speed)||speed<0.5){marker.setLatLng([target.lat,target.lon]);vesselAnimation.delete(key);return;}
 vesselAnimation.set(key,{from,to:target,started:now,duration:VESSEL_TWEEN_MS});
}


const VESSEL_HARBOR_CENTER=[63.1115,7.7600];
const VESSEL_HARBOR_CORE_NM=2.2;
const VESSEL_HARBOR_APPROACH_NM=6.0;
const vesselMotionHistory=new Map();
const VESSEL_TRACK_KEEP_MS=30*60*1000;
const VESSEL_TRACK_MAX_FIXES=120;
const VESSEL_TRACK_STORAGE_KEY='trafikkradar-vessel-trails-v1';
const VESSEL_TRACK_MAX_VESSELS=100;
function validVesselTrackFix(p,now=Date.now()){
  return p && Number.isFinite(p.lat) && Math.abs(p.lat)<=90 &&
    Number.isFinite(p.lon) && Math.abs(p.lon)<=180 &&
    Number.isFinite(p.at) && p.at<=now+10000 && now-p.at<=VESSEL_TRACK_KEEP_MS;
}
function loadStoredVesselTracks(){
  try{
    const saved=JSON.parse(localStorage.getItem(VESSEL_TRACK_STORAGE_KEY)||'[]');
    if(!Array.isArray(saved))return;
    const now=Date.now();
    for(const row of saved.slice(0,VESSEL_TRACK_MAX_VESSELS)){
      if(!row||typeof row.key!=='string'||row.key.length>80||!Array.isArray(row.fixes))continue;
      const fixes=row.fixes.map(p=>({lat:Number(p.lat),lon:Number(p.lon),at:Number(p.at)}))
        .filter(p=>validVesselTrackFix(p,now)).sort((a,b)=>a.at-b.at).slice(-VESSEL_TRACK_MAX_FIXES);
      if(!fixes.length)continue;
      const last=fixes[fixes.length-1];
      vesselMotionHistory.set(row.key,{
        lat:last.lat,lon:last.lon,at:last.at,
        distance:nm(dist(last.lat,last.lon,VESSEL_HARBOR_CENTER[0],VESSEL_HARBOR_CENTER[1])),
        trend:'ukjent',observed:0,moving:false,fixes
      });
    }
  }catch(e){console.warn('Kunne ikke hente lagrede AIS-spor:',e);}
}
function persistVesselTracks(){
  try{
    const now=Date.now();
    const saved=[...vesselMotionHistory].map(([key,row])=>({
      key,fixes:(row.fixes||[]).filter(p=>validVesselTrackFix(p,now)).slice(-VESSEL_TRACK_MAX_FIXES)
    })).filter(row=>row.fixes.length).slice(-VESSEL_TRACK_MAX_VESSELS);
    localStorage.setItem(VESSEL_TRACK_STORAGE_KEY,JSON.stringify(saved));
  }catch(e){console.warn('Kunne ikke lagre AIS-spor:',e);}
}
loadStoredVesselTracks();
function updateVesselMotionHistory(items){
  const now=Date.now(), seen=new Set();
  for(const v of items||[]){
    const key=vesselKey(v),lat=Number(v.lat),lon=Number(v.lon);
    if(!key||!Number.isFinite(lat)||!Number.isFinite(lon))continue;
    seen.add(key);
    const previous=vesselMotionHistory.get(key);
    const distance=nm(dist(lat,lon,VESSEL_HARBOR_CENTER[0],VESSEL_HARBOR_CENTER[1]));
    const movement=previous?nm(dist(lat,lon,previous.lat,previous.lon)):0;
    const elapsed=previous?(now-previous.at)/1000:0;
    // Require a new AIS position, not repeated polling of the same fix.
    const newFix=Boolean(previous&&elapsed>=10&&movement>=0.015);
    const change=previous?previous.distance-distance:0;
    const trend=newFix&&Math.abs(change)>=0.035?(change>0?'inn':'ut'):(previous?.trend||'ukjent');
    let fixes=Array.isArray(previous?.fixes)?previous.fixes.filter(p=>validVesselTrackFix(p,now)):[];
    const lastFix=fixes[fixes.length-1];
    const fixDistance=lastFix?nm(dist(lat,lon,lastFix.lat,lastFix.lon)):0;
    // Avoid drawing a line across missing AIS coverage or improbable jumps.
    if(lastFix && fixDistance>1.5)fixes=[];
    if(!fixes.length || (newFix && fixDistance>=0.015))fixes.push({lat,lon,at:now});
    vesselMotionHistory.set(key,{lat,lon,at:newFix||!previous?now:previous.at,
      distance,trend,observed:newFix?(previous?.observed||0)+1:(previous?.observed||0),
      moving:newFix,previousDistance:previous?.distance??distance,
      fixes:fixes.slice(-VESSEL_TRACK_MAX_FIXES)});
  }
  for(const [key,row] of vesselMotionHistory){
    if(!seen.has(key) && now-row.at>VESSEL_TRACK_KEEP_MS)vesselMotionHistory.delete(key);
  }
  persistVesselTracks();
}
function movingHarborVessel(v){
  const key=vesselKey(v),row=vesselMotionHistory.get(key);
  const lat=Number(v.lat),lon=Number(v.lon),speed=Number(v.speed);
  if(!key||!row||!Number.isFinite(lat)||!Number.isFinite(lon)||
    !Number.isFinite(speed)||speed<1.5)return null;
  const d=nm(dist(lat,lon,VESSEL_HARBOR_CENTER[0],VESSEL_HARBOR_CENTER[1]));
  if(d>VESSEL_HARBOR_APPROACH_NM)return null;
  // An observed position change in the recent AIS fixes is required:
  // nonmoving or stale AIS targets never claim automatic map focus.
  if(row.observed<1||Date.now()-row.at>100*1000)return null;
  // For a second repeated snapshot retain focus only briefly, while AIS can be delayed.
  const inHarbor=d<=VESSEL_HARBOR_CORE_NM;
  const entering=row.trend==='inn'&&d>VESSEL_HARBOR_CORE_NM;
  const exiting=row.trend==='ut'&&d>VESSEL_HARBOR_CORE_NM;
  return {key,d,lat,lon,speed,inHarbor,entering,exiting,
    rank:inHarbor?2.8:(entering||exiting?2.65:2.25)};
}

const escapeVesselText=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function vesselKey(v){return String(v.mmsi||v.name||'').trim();}
function vesselDetail(v){
 const name=v.name||('MMSI '+(v.mmsi||'ukjent'));
 const category=v.category==='hurtigrute'?'Hurtigruten/Havila':v.category==='hurtigbat'?'Hurtigbåt':v.category==='mulig_hurtigbat'?'Mulig hurtigbåt':vesselKind(v);
 const fields=[
  ['Type',category],['MMSI',v.mmsi],['Fart',Number.isFinite(Number(v.speed))?Number(v.speed).toFixed(1)+' knop':''],
  ['Kurs',Number.isFinite(Number(v.course))?Math.round(Number(v.course))+'°':''],
  ['Avstand KSU',Number.isFinite(Number(v.distanceNm))?Number(v.distanceNm).toFixed(1)+' NM':''],
  ['Destinasjon',v.destination],['AIS-tid',v.msgtime]
 ];
 return '<div style="min-width:190px"><b>'+escapeVesselText(name)+'</b>'+
  fields.filter(([,value])=>value!==''&&value!=null).map(([key,value])=>'<div><strong>'+escapeVesselText(key)+':</strong> '+escapeVesselText(value)+'</div>').join('')+
  '<small>AIS · Kystverket</small>'+ 
  '<div class="vessel-popup-photo-slot" data-vessel-photo-key="'+escapeVesselText(vesselKey(v))+'">'+
  '<small>Søker etter fartøyfoto…</small></div></div>';
}

const AIRCRAFT_TYPE_INFO={
 A20N:['Airbus A320neo','Tomotors passasjerfly','jet'],
 A320:['Airbus A320','Tomotors passasjerfly','jet'],
 B738:['Boeing 737-800','Tomotors passasjerfly','jet'],
 B38M:['Boeing 737 MAX 8','Tomotors passasjerfly','jet'],
 DH8D:['De Havilland Dash 8 Q400','Turboprop regionalfly','prop'],
 DH8C:['De Havilland Dash 8-300','Turboprop regionalfly','prop'],
 DH8A:['De Havilland Dash 8-100','Turboprop regionalfly','prop'],
 S92:['Sikorsky S-92','Transport- og offshorehelikopter','heli'],
 GLF5:['Gulfstream V','Forretningsfly / langdistansejet','jet'],
 GLF6:['Gulfstream G650','Forretningsfly / langdistansejet','jet'],
 C130:['Lockheed C-130 Hercules','Transportfly','prop'],
 C30J:['Lockheed KC-130J Hercules','Militært transport- og tankfly','prop'],
 P8:['Boeing P-8 Poseidon','Maritimt patruljefly','jet'],
 AW10:['AgustaWestland AW101','Helikopter for redning og transport','heli'],
 E190:['Embraer E190','Regionalt jetfly','jet'],
 E195:['Embraer ERJ-190-200 (E195)','Regionalt jetfly','jet'],
 E290:['Embraer E190-E2 / ERJ-190-300','Regionalt jetfly','jet']
};

const AIRCRAFT_REG_PHOTOS={
 'SE-RSI':{file:'SE-RSI Embraer 195 SAS ARN 01.jpg',credit:'Bene Riobó',license:'Lisens på bildesiden',exact:true}
};
const AIRCRAFT_TYPE_PHOTOS={
 E195:{file:'SE-RSK Embraer E195LR SAS.jpg',credit:'Marius Vassnes',license:'CC BY-SA 4.0',licenseUrl:'https://creativecommons.org/licenses/by-sa/4.0/'},
 DH8D:{file:'Widerøe LN-WDE Q400.jpg',credit:'Alasdair McLellan',license:'CC BY-SA 3.0',licenseUrl:'https://creativecommons.org/licenses/by-sa/3.0/'},
 DH8A:{file:'Widerøe - LN-WIM - De Havilland Canada DHC-8-100 Dash 8 8Q - Oslo Gardermoen Airport.jpg',credit:'Mitchul Hope',license:'Se Commons'},
 A20N:{file:'G-UJEC A320neo, easyJet, Palma de Mallorca 09-05-26.jpg',credit:'Duncan Kirk',license:'CC BY 4.0',licenseUrl:'https://creativecommons.org/licenses/by/4.0/'},
 A320:{file:'EasyJet Airbus A320.jpg',credit:'RubenVanKuik',license:'CC BY 4.0',licenseUrl:'https://creativecommons.org/licenses/by/4.0/'},
 E290:{file:'Embraer E190-E2 (ERJ190-300) ‘LN-WEA’ Widerøe (49502451571).jpg',credit:'Alan Wilson',license:'CC BY-SA 2.0',licenseUrl:'https://creativecommons.org/licenses/by-sa/2.0/'}
};
function aircraftPhotoMarkup(p,illustration){
 const code=String(p?.type||'').trim().toUpperCase();
 const reg=String(p?.reg||'').trim().toUpperCase();
 const photo=AIRCRAFT_REG_PHOTOS[reg]||AIRCRAFT_TYPE_PHOTOS[code];
 if(!photo)return illustration;
 const filename=encodeURIComponent(photo.file.replace(/ /g,'_'));
 const source='https://commons.wikimedia.org/wiki/File:'+filename;
 const src='https://commons.wikimedia.org/wiki/Special:FilePath/'+filename+'?width=640';
 return '<div class="type-photo-wrap">'+
  '<img class="type-photo" src="'+src+'" alt="'+(photo.exact?'Fotografi av fly '+escapeVesselText(reg):'Fotografi av flytypen '+escapeVesselText(code))+'" loading="lazy" decoding="async" '+
  'onerror="this.hidden=true;this.nextElementSibling.hidden=false">'+
  '<div class="type-photo-fallback" hidden>'+illustration+'</div></div>'+
  '<small class="type-credit">Foto: <a href="'+source+'" target="_blank" rel="noopener noreferrer">'+escapeVesselText(photo.credit)+'</a> · '+(photo.licenseUrl?'<a href="'+photo.licenseUrl+'" target="_blank" rel="noopener noreferrer">'+escapeVesselText(photo.license)+'</a>':escapeVesselText(photo.license))+' · Wikimedia Commons</small>';
}
let selectedVesselTypeKey='',manualVesselSelectionUntil=0;
const VESSEL_DETAIL_HOLD_MS=30000;
function typeIllustration(kind){
 const paths={
 jet:'M160 22 L171 31 192 107 285 144 285 154 190 146 176 203 213 221 213 230 160 217 107 230 107 221 144 203 130 146 35 154 35 144 128 107 149 31 Z',
 prop:'M160 27 L171 35 190 117 285 142 285 151 192 151 174 203 211 219 211 230 160 216 109 230 109 219 146 203 128 151 35 151 35 142 130 117 149 35 Z',
 heli:'M46 56 H276 V62 H46 Z M157 64 H164 V100 H157 Z M114 120 Q115 95 160 92 Q206 95 207 120 Q208 143 177 147 H143 Q112 147 114 120 Z M208 120 L270 129 V136 L207 139 Z M132 149 L126 178 H193 L188 149 Z M117 178 H204 V184 H117 Z',
 vessel:'M36 146 H284 L247 195 H73 Z M102 112 H223 V146 H102 Z M131 82 H193 V112 H131 Z'
 };
 const waves=kind==='vessel'?'<path d="M34 214 Q55 202 77 214 T120 214 T163 214 T206 214 T249 214 T292 214" stroke="#4a99b2" stroke-width="5" fill="none"/>':'';
 const props=kind==='prop'?'<circle cx="90" cy="145" r="11" fill="#245769"/><circle cx="230" cy="145" r="11" fill="#245769"/>':'';
 return '<svg viewBox="0 0 320 240" class="type-illustration" role="img" aria-label="Forenklet fartøyillustrasjon" xmlns="http://www.w3.org/2000/svg"><rect width="320" height="240" fill="#0d2839"/><circle cx="270" cy="47" r="30" fill="#184454"/><path d="'+(paths[kind]||paths.jet)+'" fill="#79d2e6" stroke="#8cdeee" stroke-width="2"/>'+props+waves+'</svg>';
}
function aircraftTypeCard(p){
 const code=String(p.type||'').trim().toUpperCase();
 const info=AIRCRAFT_TYPE_INFO[code];
 const heli=isHelicopter(p);
 const name=info?.[0]||p.desc||(heli?'Helikopter':'Flytype ukjent');
 const label=info?.[1]||(heli?'Helikopter':'Fly');
 return '<details class="type-info" open><summary>Om flytypen</summary><div class="type-info-inner">'+
 '<div id="aircraft-photo-slot">'+aircraftPhotoMarkup(p,typeIllustration(info?.[2]||(heli?'heli':'jet')))+'</div><strong>'+escapeVesselText(name)+'</strong>'+
 '<span>'+escapeVesselText(label)+(code?' · '+escapeVesselText(code):'')+'</span>'+
 '<small id="aircraft-photo-note">'+(AIRCRAFT_REG_PHOTOS[String(p.reg||'').trim().toUpperCase()]?'Foto av registreringen '+escapeVesselText(p.reg):'Typebilde eller illustrasjon – ikke nødvendigvis samme fly')+'</small></div></details>';
}
function vesselMovementContext(v){
 const lat=Number(v?.lat),lon=Number(v?.lon);
 if(!Number.isFinite(lat)||!Number.isFinite(lon))
   return {title:'Fartøy i området ved Kristiansund',detail:'Bevegelse mot havnen er ikke bekreftet'};
 const distance=nm(dist(lat,lon,VESSEL_HARBOR_CENTER[0],VESSEL_HARBOR_CENTER[1]));
 const record=vesselMotionHistory.get(vesselKey(v));
 const speed=Number(v.speed);
 if(distance<=VESSEL_HARBOR_CORE_NM)
   return {title:'Fartøy i havneområdet',detail:'Innenfor ca. 2,2 NM fra havneområdets referansepunkt · havneanløp ikke bekreftet'};
 if(record?.observed>=1 && Date.now()-record.at<=100000 &&
    Number.isFinite(speed)&&speed>=1.5){
   if(record.trend==='inn')
     return {title:'Fartøy nærmer seg havneområdet',detail:'AIS-posisjonene viser kortere avstand til havneområdet · havneanløp ikke bekreftet'};
   if(record.trend==='ut')
     return {title:'Fartøy beveger seg bort fra havneområdet',detail:'AIS-posisjonene viser økende avstand til havneområdet'};
 }
 return {title:'Fartøy i farvannet ved Kristiansund',detail:'Passasje eller havneanløp er ikke bekreftet'};
}
function updateVesselContext(v){
 const context=vesselMovementContext(v);
 const heading=$('aircraft-panel-title');
 if(heading)heading.textContent=context.title;
 const detail=$('vessel-motion-note');
 if(detail)detail.textContent=context.detail;
}
function vesselTypeCard(v){
 const title=v.name||('MMSI '+(v.mmsi||'ukjent'));
 const category=v.category==='hurtigrute'?'Hurtigruten/Havila':v.category==='hurtigbat'?'Hurtigbåt':v.category==='mulig_hurtigbat'?'Mulig hurtigbåt':vesselKind(v);
 const fields=[['MMSI',v.mmsi],['IMO',v.imo],['Oppgitt AIS-destinasjon',v.destination],['Lengde',v.length&&v.length+' m'],['Bredde',v.width&&v.width+' m'],['AIS-tid',v.msgtime]];
 const speed=v.speed!=null&&v.speed!==''&&Number.isFinite(Number(v.speed))?Number(v.speed).toFixed(1)+' knop':'–';
 const course=v.course!=null&&v.course!==''&&Number.isFinite(Number(v.course))?Math.round(Number(v.course))+'°':'–';
 return '<section class="vessel-detail" aria-label="Valgt skip">'+
 '<div class="vessel-detail-head"><strong id="vessel-detail-name">'+escapeVesselText(title)+'</strong><span>'+escapeVesselText(category)+'</span></div>'+ 
 '<small id="vessel-motion-note">'+escapeVesselText(vesselMovementContext(v).detail)+'</small>'+
 '<div class="vessel-detail-metrics"><div><small>FART</small><b data-vessel-speed>'+escapeVesselText(speed)+'</b></div><div><small>KURS</small><b data-vessel-course>'+escapeVesselText(course)+'</b></div></div>'+
 '<div id="vessel-photo-slot"></div><div id="vessel-photo-fallback">'+typeIllustration('vessel')+'</div>'+
 '<small id="vessel-photo-note" role="status">Søker etter skipsfoto · AIS fra Kystverket</small>'+
 '<div class="vessel-detail-fields">'+fields.filter(([,value])=>value!==undefined&&value!==null&&value!=='').map(([name,value])=>'<span data-vessel-field="'+escapeVesselText(name)+'">'+escapeVesselText(name)+': '+escapeVesselText(value)+'</span>').join('')+'</div>'+ 
 '<div id="vessel-wikidata" class="vessel-wikidata" aria-live="polite"><small>Henter flere skipsopplysninger fra Wikidata …</small></div></section>';
}
let lastTypeCardIdentity='',lastTypeCardSignature='';
function updateTypeCard(p){
 const el=$('type-info');
 if(!el)return;
 const vessel=selectedVesselTypeKey?vessels.find(v=>vesselKey(v)===selectedVesselTypeKey):null;
 const identity=vessel?'vessel:'+vesselKey(vessel):p?'aircraft:'+String(p.type||'').toUpperCase()+':'+String(p.reg||'').toUpperCase():'';
 const signature=vessel?JSON.stringify([identity,vessel.name,vessel.mmsi,vessel.imo,vessel.destination,vessel.length,vessel.width,vessel.speed,vessel.course,vessel.msgtime]):identity;
 if(vessel&&identity===lastTypeCardIdentity){
   // Keep the same photo element while fresh AIS values arrive.
   const speed=el.querySelector('[data-vessel-speed]'),course=el.querySelector('[data-vessel-course]');
   if(speed)speed.textContent=vessel.speed!=null&&vessel.speed!==''&&Number.isFinite(Number(vessel.speed))?Number(vessel.speed).toFixed(1)+' knop':'–';
   if(course)course.textContent=vessel.course!=null&&vessel.course!==''&&Number.isFinite(Number(vessel.course))?Math.round(Number(vessel.course))+'°':'–';
   const name=el.querySelector('#vessel-detail-name');if(name)name.textContent=vessel.name||('MMSI '+(vessel.mmsi||'ukjent'));
   const fields={MMSI:vessel.mmsi,IMO:vessel.imo,'Oppgitt AIS-destinasjon':vessel.destination,Lengde:vessel.length&&vessel.length+' m',Bredde:vessel.width&&vessel.width+' m','AIS-tid':vessel.msgtime};
   for(const field of el.querySelectorAll('[data-vessel-field]')){
     const key=field.dataset.vesselField,value=fields[key];
     field.textContent=key+': '+(value??'–');
   }
   updateVesselContext(vessel);
   lastTypeCardSignature=signature;
   return;
 }
 if(signature===lastTypeCardSignature)return;
 lastTypeCardIdentity=identity;
 lastTypeCardSignature=signature;
 el.innerHTML=vessel?vesselTypeCard(vessel):p?aircraftTypeCard(p):'';
 el.dataset.photoIdentity=identity;
 if(vessel){
   updateVesselContext(vessel);
   if(window.loadSelectedVesselPhoto)void window.loadSelectedVesselPhoto(vessel,identity);
   if(window.loadSelectedVesselFacts)void window.loadSelectedVesselFacts(vessel,identity);
 }
 if(!vessel&&p&&window.loadSelectedAircraftPhoto)void window.loadSelectedAircraftPhoto(p,identity);
}

// Only promote a vessel when it is moving and no more important KSU aircraft needs focus.
function autoSelectHarborVessel(now=Date.now()){
 if(now<manualVesselSelectionUntil)return;
 const first=smartMapCandidate(planes)[0];
 const key=first?.key?.startsWith('bat:')?first.key.slice(4):'';
 const vessel=key?vessels.find(v=>vesselKey(v)===key):null;
 if(!vessel){
   // Keep an existing ship card until a flight takes priority or the target disappears.
   if(selectedVesselTypeKey&&((first&&!first.key.startsWith('bat:'))||!vessels.some(v=>vesselKey(v)===selectedVesselTypeKey))){
     selectedVesselTypeKey='';
     syncVesselSelectionMarkers();
     updateTypeCard(selected);
     if($('aircraft-panel-title'))$('aircraft-panel-title').textContent='Fly i området';
     if($('cards'))$('cards').hidden=false;
   }
   return;
 }
 if(selectedVesselTypeKey!==key && now-vesselFocusChangedAt<VESSEL_DETAIL_HOLD_MS)return;
 if(selectedVesselTypeKey!==key){
   selectedVesselTypeKey=key;
   vesselFocusChangedAt=now;
   syncVesselSelectionMarkers();
 }
 updateVesselContext(vessel);
 if($('cards'))$('cards').hidden=true;
 updateTypeCard(selected);
}
function syncVesselSelectionMarkers(){
 for(const [key,marker] of vesselMarkers){
   const el=marker.getElement()?.querySelector('.vessel-marker');
   if(el)el.classList.toggle('selected',key===selectedVesselTypeKey);
 }
}
function renderVesselGuides(){
  vesselGuideLayer.clearLayers();
  const now=Date.now();
  for(const v of vessels){
    const key=vesselKey(v),row=vesselMotionHistory.get(key);
    if(!key||!row)continue;
    const lat=Number(v.lat),lon=Number(v.lon),speed=Number(v.speed);
    if(!Number.isFinite(lat)||!Number.isFinite(lon))continue;
    // Previous route: observed AIS positions only, also after a vessel stops.
    const fixes=(row.fixes||[]).filter(p=>now-p.at<=VESSEL_TRACK_KEEP_MS);
    if(fixes.length>=2){
      L.polyline(fixes.map(p=>[p.lat,p.lon]),{
        color:'#13d3e6',weight:3,opacity:.8,interactive:false
      }).addTo(vesselGuideLayer);
    }
    // Short course-over-ground guide, NOT a predicted destination.
    if(!Number.isFinite(speed)||speed<1.5)continue;
    if(v.course===null||v.course===undefined||v.course==='')continue;
    const course=Number(v.course);
    if(!Number.isFinite(course)||course<0||course>=360)continue;
    const end=destinationPoint(lat,lon,Math.min(1,speed*2/60),course);
    if(!end)continue;
    L.polyline([[lat,lon],end],{
      color:'#fbbf24',weight:3,opacity:.95,dashArray:'5 6',interactive:false
    }).addTo(vesselGuideLayer);
  }
}
function renderVessels(){
 const seen=new Set();
 for(const v of vessels){
  if(!Number.isFinite(Number(v.lat))||!Number.isFinite(Number(v.lon)))continue;
  const key=vesselKey(v);
  if(!key)continue;
  seen.add(key);
  let marker=vesselMarkers.get(key);
  const name=v.name||('MMSI '+(v.mmsi||'ukjent'));
  if(marker){
   // Reuse the DOM marker instead of deleting it at every AIS refresh.
   scheduleVesselMotion(marker,key,v);
   marker.setTooltipContent('Fartøy: '+escapeVesselText(name));
   // Preserve an open popup (and its loaded photo) during 30-second AIS refreshes.
   if(!marker.isPopupOpen())marker.setPopupContent(vesselDetail(v));
   continue;
  }
  marker=L.marker([v.lat,v.lon],{icon:vesselIcon(v),zIndexOffset:500})
   .bindTooltip('Fartøy: '+escapeVesselText(name),{direction:'top',offset:[0,-12]})
   .bindPopup(vesselDetail(v),{autoPan:false})
   .addTo(vesselLayer);
  marker.on('popupopen',event=>{
   const current=vessels.find(item=>vesselKey(item)===key)||v;
   if(window.loadVesselPopupPhoto)void window.loadVesselPopupPhoto(current,event.popup.getElement());
  });
  marker.on('click',()=>{
   const current=vessels.find(item=>vesselKey(item)===key)||v;
   selectedVesselTypeKey=key;
   syncVesselSelectionMarkers();
   manualVesselSelectionUntil=Date.now()+SMART_MAP_MANUAL_MS;
   updateVesselContext(current);
   if($('cards'))$('cards').hidden=true;
   updateTypeCard(selected);
   updateMapFocusStatus();
  });
  vesselMarkers.set(key,marker);
 }
 for(const [key,marker] of vesselMarkers){
  if(seen.has(key))continue;
  vesselLayer.removeLayer(marker);
  vesselMarkers.delete(key);
  vesselAnimation.delete(key);
 }
 syncVesselSelectionMarkers();
 renderVesselGuides();
}
async function loadVessels(){
  try{
    const r=await fetch('https://flyradar-ksu.vidar-skoglund.workers.dev/vessels',{cache:'no-store',credentials:'omit'});
    if(!r.ok)throw new Error('HTTP '+r.status);
    const j=await r.json();
    vessels=Array.isArray(j?.vessels)?j.vessels:[];
    updateVesselMotionHistory(vessels);
    renderVessels();
    autoSelectHarborVessel();
    if(selectedVesselTypeKey)updateTypeCard(selected);
    fitMap(planes,settings());
    const el=document.getElementById('vessel-live-status');
    if(el)el.textContent=vessels.length
      ?vessels.length+' fartøy i bevegelse · AIS fra Kystverket'
      :'Ingen fartøy i bevegelse registrert innen 25 NM';
  }catch(e){
    // Keep the last confirmed AIS position on transient errors; no motion extrapolation.
    vesselAnimation.clear();
    vessels=[];
    vesselLayer.clearLayers();
    vesselGuideLayer.clearLayers();
    vesselMarkers.clear();
    if(Date.now()>=manualVesselSelectionUntil){
      selectedVesselTypeKey='';
      syncVesselSelectionMarkers();
      if($('cards'))$('cards').hidden=false;
      updateTypeCard(selected);
    }
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
  // A flight with confirmed cancellation is still shown until the planned time
  // has passed; remove flights when they are more than 30 minutes out of date.
  return Number.isFinite(time)&&time>=now-30*60*1000;
}
function avinorTimeInfo(f){
  const scheduled=Date.parse(f.schedule_time||'');
  const revised=String(f.status_code||'').toUpperCase()==='E'
    ?Date.parse(f.status_time||''):NaN;
  const changed=Number.isFinite(scheduled)&&Number.isFinite(revised)
    &&Math.abs(revised-scheduled)>=60000;
  const display=changed?revised:scheduled;
  const format=t=>Number.isFinite(t)
    ?new Date(t).toLocaleTimeString('no-NO',{hour:'2-digit',minute:'2-digit'}):'–';
  return {changed,delayed:changed&&revised>scheduled,
    time:format(display),scheduled:format(scheduled)};
}
function avinorLivePlane(f){
  const key=avinorFlightKey(f);
  return planes.find(p=>p.ksuFlight&&avinorFlightKey(p.ksuFlight)===key&&!p.signalLost)||null;
}
function renderAvinor(){
  const el=$('avinor-list'),side=$('avinor-list-side');
  if(!el&&!side)return;
  if(!avinorFlights.length){
    if(el)el.innerHTML='<div class="schedule-empty">Ingen flytider fra Avinor tilgjengelig akkurat nå.</div>';
    if(side)side.innerHTML='<div class="schedule-empty">Ingen flytider fra Avinor tilgjengelig.</div>';
    return;
  }
  const now=Date.now();
  // When a flight is matched to a live ADS-B position, keep it prominent.
  // The remaining flights retain chronological order.
  const rows=avinorFlights
    .filter(f=>upcomingSchedule(f,now))
    .map(f=>({f,livePlane:avinorLivePlane(f)}))
    .sort((a,b)=>Number(Boolean(b.livePlane))-Number(Boolean(a.livePlane))
      ||scheduleDisplayTime(a.f)-scheduleDisplayTime(b.f))
    .slice(0,4);

  const rowHtml=({f,livePlane},index,compact=false)=>{
    const info=avinorTimeInfo(f);
    const dep=f.arr_dep==='D';
    const heli=/^(HKS|HMB)/i.test(f.flight_id||'') ||
      /helicopter/i.test((f.airline_name||'')+' '+(f.airline||''));
    const route=f.airport==='KSU'?'':`${dep?'Til':'Fra'} ${f.airport||'–'}`;
    const key=avinorFlightKey(f);
    const stalePlane=planes.find(p=>p.ksuFlight&&avinorFlightKey(p.ksuFlight)===key&&p.signalLost)||null;
    const matched=Boolean(livePlane),staleMatched=Boolean(stalePlane);
    const status=String(f.status_code||'').toUpperCase();
    let opStatus='',statusClass='neutral';
    if(status==='C'){
      opStatus='Innstilt';statusClass='cancelled';
    }else if(matched){
      opStatus='Følges nå';statusClass='live';
    }else if(info.delayed){
      opStatus='Forsinket';statusClass='changed';
    }else if(info.changed){
      opStatus='Tid endret';statusClass='changed';
    }else if(staleMatched){
      opStatus='Signal mistet';statusClass='stale';
    }
    const distanceText=matched&&Number.isFinite(Number(livePlane.d))
      ?`${nm(livePlane.d).toFixed(0)} NM fra KSU`:'';
    const extra=[info.changed?`Planlagt ${info.scheduled}`:'',
      matched?distanceText:''].filter(Boolean).join(' · ');
    const nextClass=index===0&&!matched?' next':'';
    return `<div class="schedule-row ${heli?'heli':''} ${matched?'matched':''} ${staleMatched?'stale':''}${nextClass}">
      <div class="schedule-direction ${dep?'dep':'arr'}">${dep?'AVG':'ANK'}</div>
      <div class="schedule-main">
        <div class="schedule-flightline">
          <b>${heli?'🚁 ':''}${f.flight_id||'Ukjent'}</b>
          <span class="schedule-route">${route}</span>
          ${opStatus?`<span class="schedule-status ${statusClass}">${opStatus}</span>`:''}
        </div>
        ${extra?`<div class="schedule-live-detail">${extra}</div>`:''}
      </div>
      <div class="schedule-clock"><strong class="schedule-time">${info.time}</strong>
        <small class="schedule-time-label">${info.changed?'Ny tid':'Planlagt'}</small>
      </div>
    </div>`;
  };
  if(el)el.innerHTML=rows.map((row,index)=>rowHtml(row,index,false)).join('')||
    '<div class="schedule-empty">Ingen kommende flyvninger.</div>';
  if(side)side.innerHTML=rows.map((row,index)=>rowHtml(row,index,true)).join('')||
    '<div class="schedule-empty">Ingen kommende flyvninger.</div>';
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

  // Ikke tildel KSU-avgang ut fra selskap, tidspunkt, kurs og posisjon.
  // WIF9AL og WIF7D er callsigns, ikke entydige WF-rutenumre.
  // Bare identitetsbekreftede Avinor-treff ovenfor kan sette ksuFlight.
  return null;
}
function attachAvinorMatches(){
  planes.forEach(p=>{
    // Fjern svake KSU-koblinger fra forrige kodeversjon, også i cache.
    // En bekreftet flyrute som ikke omfatter KSU skal aldri vises som KSU-avgang.
    const f=p.ksuFlight;
    if(f){
      const exact=[...flightAliases(p.flight)].some(x=>flightAliases(f.flight_id).has(x));
      const linkedRoute=p.routeData &&
        routeContainsAirport(p.routeData,'KSU') &&
        routeContainsAirport(p.routeData,f.airport);
      if(f._inferredKsuMatch || (!exact && !linkedRoute))p.ksuFlight=null;
    }
    if(!p.ksuFlight){
      const call=compactFlightId(p.flight);
      if(call){
        for(const f of avinorFlights){
          const identity=remoteKsuIdentityCache.get(avinorFlightKey(f));
          if(identity?.callsign && compactFlightId(identity.callsign)===call &&
             p.routeData && routeContainsAirport(p.routeData,'KSU') &&
             routeContainsAirport(p.routeData,f.airport)){
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
    if(movement==='På vei til KSU')return 'På vei til KSU';
    if(movement==='Mulig innflyging mot KSU')return 'Mulig innflyging mot KSU';
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
const PROXIMITY_SOUND_PREF_KEY='flyradar-ksu-proximity-sound-v1';
let proximityReady=false, proximityAudio=null, proximitySound=true;
try{proximitySound=localStorage.getItem(PROXIMITY_SOUND_PREF_KEY)!=='off';}catch(e){}
function saveProximitySoundPreference(){
  try{localStorage.setItem(PROXIMITY_SOUND_PREF_KEY,proximitySound?'on':'off');}catch(e){}
}
function renderProximitySoundButton(){
  const button=$('proximity-sound');
  if(!button)return;
  button.textContent=proximitySound?'Nærhetslyd: på':'Nærhetslyd: av';
  button.setAttribute('aria-pressed',String(proximitySound));
  const note=$('sound-note');
  if(note)note.textContent=proximitySound&&(!proximityAudio||proximityAudio.state!=='running')
    ?'Lyd er på som standard. Nettleseren kan kreve ett trykk på siden før lyd spilles.'
    :'Lydinnstillingen lagres på denne enheten.';
}
async function unlockProximityAudio(){
  if(!proximitySound)return;
  try{
    const Audio=window.AudioContext||window.webkitAudioContext;
    if(!Audio)return;
    proximityAudio=proximityAudio||new Audio();
    if(proximityAudio.state!=='running')await proximityAudio.resume();
  }catch(e){}
  renderProximitySoundButton();
}
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
  proximitySound=!proximitySound;
  saveProximitySoundPreference();
  if(proximitySound)await unlockProximityAudio();
  renderProximitySoundButton();
}
// The prominent page banner is local to KSU; the separate 50 NM tracking/push rules are unchanged.
function withinKsuAlertArea(p){return !p.signalLost&&ksuDistanceNm(p)<=25}
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
  const flight=ksuFlightInfo(p);
  const onGroundAtKsu=d<=3.5 && isGroundOrTaxi(p);
  const speed=Number(p.gs);
  const moving=Number.isFinite(speed)&&speed>5;
  let title;
  if(onGroundAtKsu&&flight?.direction==='Avgang KSU'){
    title=moving?'Beveger seg på bakken før avgang fra KSU':'Registrert på bakken før avgang fra KSU';
  }else if(onGroundAtKsu&&flight?.direction==='Ankomst KSU'){
    title=moving?'Beveger seg på bakken etter landing på KSU':'På bakken etter landing på KSU';
  }else if(onGroundAtKsu){
    title=moving?'Fly i bevegelse på KSU':'Fly registrert på bakken ved KSU';
  }else{
    title=confirmedKsuArrival(p)?'På innflyging mot KSU':flight?.direction==='Avgang KSU'?'Avgang fra KSU':d<=10?(lowFlying?'Lavtflygende nær KSU':'Fly nær KSU'):'Fly innen 25 NM fra KSU';
  }
  const type=String(p.type||'').trim().toUpperCase();
  const model={S92:'Sikorsky S-92',S76:'Sikorsky S-76',H145:'Airbus H145',H135:'Airbus H135',AW13:'Leonardo AW139',A139:'Leonardo AW139',AW16:'Leonardo AW169',A169:'Leonardo AW169'}[type]||'';
  const description=heli?(model||'Helikopter'):(type&&/^[A-Z0-9]{2,5}$/.test(type)?type:'');
  const registration=p.reg&&String(p.reg).toUpperCase()!==String(name).toUpperCase()?' · '+p.reg:'';
  const text=`${heli?'🚁':'✈'} ${title} · ${name}${description?' · '+description:''}${registration} · ${d.toFixed(1)} NM fra KSU${near.length>1?' · +'+(near.length-1)+' fly':''}`;
  if(banner.textContent!==text)banner.textContent=text;
  banner.classList.toggle('close',d<=10);
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
  const names=[['fi','adsb.fi']];
  const active=names.filter(([key])=>sourceState[key]==='OK').map(([,name])=>name);
  const unavailable=names.filter(([key])=>sourceState[key]==='feil').map(([,name])=>name);
  const diagnostic=fiRescueError?(' · '+fiRescueError+(fiRescueRetryAfter>Date.now()?' · nytt forsøk '+new Date(fiRescueRetryAfter).toLocaleTimeString('no-NO',{hour:'2-digit',minute:'2-digit'}):'')):'';
  el.textContent='Flydata: '+(active.join(' + ')||'ingen kilde bekreftet')+(mode==='worker'?' (via Worker)':mode==='combined'?' (Worker + direkte)':' (direkte)')+(unavailable.length?' · Feil: '+unavailable.join(', '):'')+diagnostic;
  el.title='Aktive datakilder. Dette viser ikke hvilken mottaker som observerte hvert fly.'+(fiRescueError?' Direkte adsb.fi: '+fiRescueError+'. Neste forsøk tidligst '+new Date(fiRescueRetryAfter).toLocaleTimeString('no-NO'):'');
}
const ADSB_PAUSE_UNTIL_MS = 0; // Tracking enabled
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
    // Browser-only diagnostic: do not request aircraft from Cloudflare or other providers.
    const direct=await rescueAdsbFi(s);
    if(!Array.isArray(direct))throw new Error('Direkte adsb.fi v3 feilet: '+(fiRescueError||'venter på nytt forsøk'));
    const merged=direct.map(a=>({...a,_source:'adsb.fi v3 (direkte)'}));
    const sharedTracks=null;
    sourceState.adsb='ikke brukt';
    sourceState.apl='ikke brukt';
    sourceState.fi='OK';
    updateAdsbSourceLabel('direct');
    recordAdminStatus('flydata', {
      worker:'deaktivert',adsbLol:'ikke brukt',adsbFi:'OK',
      airplanesLive:'ikke brukt',fiDirectError:null,fiRetryAt:null,
      aircraft:merged.length,source:'adsb.fi v3 direkte'
    });
    recordAdsbDiagnostics(merged,'direct');
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
    // Diagnostic mode: no automatic per-aircraft route lookups.
    check50NmNotifications(planes);
    if(proximityCrossings(planes).length)playProximityTone();
    renderProximityAlert(planes);
    document.body.dataset.liveSource='direct';
    render(true);
    // The explicit 25 NM pilot runs one FREE lookup per flight/day, no paid fallback.
    void runFreeRoutePilot25(planes);
  }catch(e){
    if($('proximity-alert'))$('proximity-alert').hidden=true;
    sourceState.fi='feil';
    updateAdsbSourceLabel('direct');
    if(lastGoodPlanes.length){
      planes=lastGoodPlanes.map(p=>({...p}));
      const localCount=planes.filter(withinKsuAlertArea).length;
      $('status').textContent=`${localCount} fly innen 50 NM · viser sist kjente data`;
      $('status').className='muted';
      document.body.dataset.liveSource='stale';
      render(false);
      return;
    }
    $('status').textContent='Flydata feilet: '+(fiRescueError||e.message);$('status').className='err';
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
  if(lookupRoute){
    // An explicit aircraft click should replace, not coexist with, vessel details.
    selectedVesselTypeKey='';
    manualVesselSelectionUntil=Date.now()+SMART_MAP_MANUAL_MS;
    syncVesselSelectionMarkers();
    if($('cards'))$('cards').hidden=false;
    if($('aircraft-panel-title'))$('aircraft-panel-title').textContent='Valgt fly';
    updateTypeCard(p);
  }
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
  const nearCount=planes.filter(p=>!p.signalLost&&ksuDistanceNm(p)<=50).length;
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
  const nearest=list.filter(p=>!p.signalLost&&Number.isFinite(ksuDistanceNm(p)))
    .sort((a,b)=>ksuDistanceNm(a)-ksuDistanceNm(b))[0]||null;
  const current=selected&&list.find(p=>p.hex===selected.hex&&!p.signalLost);
  const shown=nearest&&ksuDistanceNm(nearest)<=25&&(!current||ksuDistanceNm(current)>25)
    ?nearest:(current||nearest);
  if(shown){
    selected=shown;

    const selectedNm=ksuDistanceNm(shown);
    const selectedKsuFlight=ksuFlightInfo(shown);
    if(!selectedVesselTypeKey){
      if($('cards'))$('cards').hidden=false;
      if($('aircraft-panel-title'))$('aircraft-panel-title').textContent=
        selectedKsuFlight?'KSU-trafikk':selectedNm<=10?'Aktivt fly nær KSU':
        selectedNm<=25?'Fly nær KSU':'Fly i området';
    }
    const rp=routeCardParts(shown);
    const service=specialService(shown);
    const ksuInfo=ksuFlightInfo(shown);
    const hasConfirmedRoute=Boolean(ksuInfo||rp);
    const inferred=hasConfirmedRoute?null:inferredRouteLabel(shown);
    const ksuAirport=String(shown.ksuFlight?.airport||'').trim().toUpperCase();
    const uncertainKsuRoute=Boolean(ksuInfo && (!ksuAirport || ksuAirport==='KSU' || ksuAirport==='ENKB'));
    const routeBlock=uncertainKsuRoute
      ? `<div class="flight-route fallback"><div class="route-loading">Offshorehelikopter · destinasjon ikke bekreftet</div></div>`
      : ksuInfo
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
          : `<div class="flight-route fallback"><div class="route-loading">${routeLookupLabel(shown)||'Avgang og destinasjon ikke bekreftet'}</div></div>`;
    $('cards').innerHTML=`<div class="card aircraft-card ${localRelevant(shown)?'local-card':''}">
      <div class="aircraft-head">
        <div>
          <div class="aircraft-title">
            <span class="call">${shown.flight||shown.reg||shown.hex||'Ukjent'}</span>
            ${shown.type?`<span class="type-pill">${shown.type}</span>`:''}
          </div>
          <div class="operator">${shown.operator||service||shown.desc||''}</div>
          ${specialFlightCategory(shown)?`<div class="special-flight-tag" data-special-role="${specialFlightCategory(shown).id}">${specialFlightCategory(shown).label}</div>`:''}
        </div>
        <div class="dist">${shown.signalLost?'Siste kjente avstand · ':''}${liveDistanceText(shown)}</div>
      </div>
      ${ksuInfo?`<div class="ksu-flight"><b>${shown.ksuFlight?._inferredKsuMatch?'Mulig KSU-avgang':ksuInfo.direction}</b><span>${uncertainKsuRoute?'Rute ikke bekreftet':ksuInfo.route} · planlagt ${ksuInfo.time}${ksuInfo.status?' · '+ksuInfo.status:''}${shown.ksuFlight?._inferredKsuMatch?' · sannsynlig kobling, ikke bekreftet':''}</span></div>`:''}
      ${routeBlock}
      ${pilot25LookupStatus(shown)?`<div class="route-pilot-note">${pilot25LookupStatus(shown)}</div>`:''}
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
    updateTypeCard(shown);
  }else{
    selected=null;
    if($('aircraft-panel-title'))$('aircraft-panel-title').textContent='Fly i området';
    $('cards').innerHTML='';
    updateTypeCard(null);
    routeLayer.clearLayers();
  }
  // Keep detail selection synchronized with the latest aircraft priority, not only the 30s AIS poll.
  autoSelectHarborVessel();
  if(autoFit) fitMap(list,s);
  updateMapFocusStatus();
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
renderProximitySoundButton();
document.addEventListener('pointerdown',()=>{if(proximitySound)void unlockProximityAudio();},{once:true});
document.addEventListener('keydown',()=>{if(proximitySound)void unlockProximityAudio();},{once:true});
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
  const horizon=ground?2:10;
  const tail=ground?1:4;
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
  vesselMotionFrame(now);
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
function nextRefreshMs(){ return 5000; } // Aircraft snapshot every 5 seconds; vessel polling unchanged.
async function adaptiveRefresh(){
  if(refreshTimer)clearTimeout(refreshTimer);
  await refresh();
  refreshTimer=setTimeout(adaptiveRefresh,nextRefreshMs());
}
setInterval(renderAvinor,30000);
loadAvinor();loadOffshore();loadVessels();adaptiveRefresh();setInterval(loadAvinor,600000);setInterval(loadVessels,30000);requestAnimationFrame(animateAircraftMotion);

document.addEventListener('fullscreenchange',()=>{
  setTimeout(()=>{
    try{
      map.invalidateSize(true);
      // Preserve manual map position when entering or leaving fullscreen.
    }catch(e){}
  },120);
});
if('serviceWorker' in navigator){navigator.serviceWorker.register('./sw.js').catch(()=>{});}

