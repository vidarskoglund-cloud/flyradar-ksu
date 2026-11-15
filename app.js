const $=x=>document.getElementById(x);
let planes=[], display=false, selected=null, avinorFlights=[], lastGoodPlanes=[], sourceState={adsb:'ukjent',apl:'ukjent'};
let idleFocusIndex=0;
const trackHistory=new Map();
const routeCache=new Map();
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
function airportIcon(code,label,kind='route'){
  const safeCode=String(code||'APT').toUpperCase();
  const safeLabel=String(label||'Flyplass');
  return L.divIcon({
    className:'airport-wrap',
    html:`<div class="airport-marker ${kind}">
      <span class="airport-symbol">✈</span>
      <div><b>${safeCode}</b><small>${safeLabel}</small></div>
    </div>`,
    iconSize:[104,38],
    iconAnchor:[18,19]
  });
}
let home=L.marker([63.1118,7.8245],{
  icon:airportIcon('KSU','Kvernberget','home'),
  zIndexOffset:900
}).bindTooltip('KSU / Kvernberget',{direction:'top'}).addTo(map);
map.on('zoomend',()=>{try{updateRangeRings(settings())}catch(e){}});

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
function ksuMovementStatus(p){
  if(!p)return {label:'Retning usikker',detail:''};
  const distanceNm=nm(p.d);
  const alt=Number(p.alt);
  const vr=Number(p.vr);
  const tr=getTrackDeg(p);
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
  if(approachingByTrend || (approachingByTrack && distanceNm<=50)){
    return {label:'Nærmer seg KSU',detail:headingToKsu!==null?`${Math.round(headingToKsu)}° fra direkte kurs mot KSU`:''};
  }
  if(leavingByTrend || (leavingByTrack && distanceNm<=50)){
    return {label:'Forlater KSU',detail:headingToKsu!==null?`${Math.round(headingToKsu)}° fra kurs mot KSU`:''};
  }
  if(tr!==null){
    return {label:'Passerer området',detail:`kurs ${Math.round(tr)}° · ${courseLabel(tr)}`};
  }
  return {label:'Retning usikker',detail:''};
}
function movementText(p){
  const status=ksuMovementStatus(p);
  const preds=predictedPoints(p);
  const dir=courseLabel(getTrackDeg(p));
  const bits=[status.label];
  if(status.detail)bits.push(status.detail);
  bits.push(`retning ${dir}`);
  const p5=preds.find(x=>x.min===5);
  if(p5)bits.push(`+5 min ca. ${p5.nmAhead.toFixed(0)} NM`);
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
  const allowed=areaBounds(63.1118,7.8245,170);
  map.setMaxBounds(allowed.pad(0.05));
  map.options.maxBoundsViscosity=1.0;
  map.setMinZoom(5);
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
  const nearest=sorted[0];
  if(!nearest){ applyMapLevel(s); return; }

  const airport=[63.1118,7.8245];
  const nearestNm=nm(nearest.d);

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
function displayRoute(p){
  const service=specialService(p);
  if(service)return service;
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
    attachAvinorMatches();
    renderAvinor();
    render(false);
  }catch(e){
    avinorFlights=[];
    attachAvinorMatches();
    renderAvinor();
  }
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
    .slice(0,5);
  el.innerHTML=rows.map(f=>{
    const t=f.schedule_time?new Date(f.schedule_time).toLocaleTimeString('no-NO',{hour:'2-digit',minute:'2-digit'}):'–';
    const dep=f.arr_dep==='D';
    const heli=/^(HKS|HMB)/i.test(f.flight_id||'') || /helicopter/i.test((f.airline_name||'')+' '+(f.airline||''));
    const status=f.status_code?(' · '+f.status_code):'';
    const route=dep?`KSU → ${f.airport||'–'}`:`${f.airport||'–'} → KSU`;
    const matched=planes.some(p=>p.ksuFlight&&p.ksuFlight.uniqueId===f.uniqueId);
    const statusText=avinorStatusText(f);
    return `<div class="schedule-row ${heli?'heli':''} ${matched?'matched':''}">
      <div class="schedule-main"><b>${matched?'● ':''}${heli?'🚁 ':''}${f.flight_id||'Ukjent'}</b><span>${route}${statusText?' · '+statusText:''}</span></div>
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
function findKsuFlight(p){
  if(!p?.flight||!avinorFlights.length)return null;
  const aliases=flightAliases(p.flight);
  if(!aliases.size)return null;
  const now=Date.now();
  const candidates=avinorFlights.filter(f=>{
    const avAliases=flightAliases(f.flight_id);
    const same=[...aliases].some(x=>avAliases.has(x));
    if(!same)return false;
    const t=Date.parse(f.schedule_time||'');
    return !Number.isFinite(t)||Math.abs(t-now)<=8*60*60*1000;
  });
  if(!candidates.length)return null;
  candidates.sort((a,b)=>{
    const ta=Date.parse(a.schedule_time||''),tb=Date.parse(b.schedule_time||'');
    const da=Number.isFinite(ta)?Math.abs(ta-now):Number.MAX_SAFE_INTEGER;
    const db=Number.isFinite(tb)?Math.abs(tb-now):Number.MAX_SAFE_INTEGER;
    return da-db;
  });
  return candidates[0];
}
function attachAvinorMatches(){
  planes.forEach(p=>{p.ksuFlight=findKsuFlight(p);});
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

    planes=merged
      .filter(a=>a.lat!=null&&a.lon!=null)
      .map(a=>normalize(a,s))
      .filter(p=>nm(p.d)<=150)
      .sort((a,b)=>a.d-b.d);

    attachAvinorMatches();
    lastGoodPlanes=planes.map(p=>({...p}));
    if(!ingestSharedTracks(sharedTracks))updateTrackHistory(planes);
    check50NmNotifications(planes);
    const localCount=planes.filter(localRelevant).length;
    const followed=planes.filter(localRelevant).sort((a,b)=>a.d-b.d)[0];
    const followText=followed?' · følger '+(followed.flight||followed.reg||followed.hex):'';
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
  layer.clearLayers();
  list.forEach(p=>{
    L.marker([p.lat,p.lon],{icon:planeIcon(p)})
      .bindTooltip(`${p.ksuFlight?'KSU · ':localRelevant(p)?'NÆR · ':''}${p.flight||p.reg||p.hex} · ${fNm(p.d)}`,{direction:'top',offset:[0,-15]})
      .on('click',()=>{select(p);render(false)})
      .addTo(layer);
  });
  const nearest=list[0]||null;
  const current=selected&&list.find(p=>p.hex===selected.hex);
  const shown=current||nearest;
  if(shown){
    selected=shown;
    const rp=routeCardParts(shown);
    const service=specialService(shown);
    const ksuInfo=ksuFlightInfo(shown);
    const routeBlock=rp
      ? `<div class="flight-route">
          <div class="route-end"><b>${rp.fromCode}</b><span>${rp.fromPlace}</span></div>
          <div class="route-arrow"><span>✈</span><i></i></div>
          <div class="route-end"><b>${rp.toCode}</b><span>${rp.toPlace}</span></div>
        </div>`
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
      <div class="movement-status ${shown.ksuFlight?'ksu':''}">${ksuOperationalStatus(shown)}</div>
      <div class="movement">${movementText(shown)}</div>
      <div class="source">${shown.source||''}</div>
    </div>`;
    select(shown,false);
  }else{
    selected=null;
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
  const nearest=sorted[0];
  if(nearest && nm(nearest.d)>50)focusIdleCandidate(sorted,true);
},20000);
if('serviceWorker' in navigator){navigator.serviceWorker.register('./sw.js').catch(()=>{});}
