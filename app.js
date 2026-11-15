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
let home=L.circleMarker([63.1118,7.8245],{radius:7,color:'#6ee7ff',weight:3,fillColor:'#08111f',fillOpacity:1}).bindTooltip('KSU / Kvernberget').addTo(map);
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
function planeIcon(p){
  const tr=Number.isFinite(+p.track)?+p.track:0;
  return L.divIcon({
    className:'plane-wrap',
    html:`<div class="plane-marker ${localRelevant(p)?'local':''}" style="transform:rotate(${tr}deg)">✈</div>`,
    iconSize:[34,34],iconAnchor:[17,17]
  });
}
function planeKey(p){return p.hex||p.reg||p.flight||''}
function updateTrackHistory(list){
  const now=Date.now();
  const keepMs=20*60*1000;
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
  if(!Number.isFinite(+track))return'ukjent retning';
  const dirs=['nord','nordøst','øst','sørøst','sør','sørvest','vest','nordvest'];
  return dirs[Math.round(((+track%360)+360)%360/45)%8];
}
function predictedPoints(p){
  const gs=Number(p.gs), tr=Number(p.track);
  if(!Number.isFinite(gs)||!Number.isFinite(tr)||gs<=0)return[];
  return [5,10].map(min=>{
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
      weight:3,opacity:.7
    }).addTo(trackLayer);
  }
  const preds=predictedPoints(p);
  if(preds.length){
    L.polyline([[p.lat,p.lon],...preds.map(x=>x.pos)],{
      weight:2,opacity:.75,dashArray:'7 8'
    }).addTo(trackLayer);
    preds.forEach(x=>{
      L.circleMarker(x.pos,{radius:4,weight:1,fillOpacity:1})
        .bindTooltip(`Estimert +${x.min} min`,{direction:'top'})
        .addTo(trackLayer);
    });
  }
}
function movementText(p){
  const preds=predictedPoints(p);
  const dir=courseLabel(p.track);
  if(!preds.length)return `Retning: ${dir}`;
  return `Retning: ${dir} · +5 min ca. ${preds[0].nmAhead.toFixed(0)} NM · +10 min ca. ${preds[1].nmAhead.toFixed(0)} NM`;
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
    renderAvinor();
  }catch(e){
    avinorFlights=[];
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
    return `<div class="schedule-row ${heli?'heli':''}">
      <div class="schedule-main"><b>${heli?'🚁 ':''}${f.flight_id||'Ukjent'}</b><span>${route}</span></div>
      <div class="schedule-time">${t}</div>
    </div>`;
  }).join('') || '<div class="schedule-empty">Ingen kommende flyvninger.</div>';
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
  if(b)b.textContent=permission==='granted'?'Varsling aktiv':'Aktiver varsling';

  if(permission==='granted'){
    try{
      const reg=await navigator.serviceWorker.ready;
      await reg.showNotification('Flyradar KSU',{
        body:'Varsling er aktivert for fly innen 50 NM.',
        tag:'ksu-notify-ready'
      });
    }catch(e){}
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
    let merged=[], workerOk=false;
    try{
      const wr=await fetch(WORKER_URL,{cache:'no-store',credentials:'omit'});
      if(!wr.ok)throw new Error('Worker HTTP '+wr.status);
      const w=await wr.json();
      if(!w||w.ok!==true||!Array.isArray(w.ac))throw new Error('Ugyldig Worker-svar');
      merged=w.ac;
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

    lastGoodPlanes=planes.map(p=>({...p}));
    updateTrackHistory(planes);
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
    L.polyline([from,plane],{weight:2,opacity:.65,dashArray:'6 8'}).addTo(routeLayer);
    L.circleMarker(from,{radius:5,weight:2,fillOpacity:1})
      .bindTooltip('Fra: '+airportLabel(aps[0]),{direction:'top'})
      .addTo(routeLayer);
  }
  if(to){
    L.polyline([plane,to],{weight:3,opacity:.9}).addTo(routeLayer);
    L.circleMarker(to,{radius:6,weight:2,fillOpacity:1})
      .bindTooltip('Til: '+airportLabel(aps[aps.length-1]),{direction:'top'})
      .addTo(routeLayer);
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
      ? `<b>${p.flight||p.reg||p.hex||'Ukjent'} · ${fNm(p.d)}</b><span>${[p.reg,p.type,displayRoute(p),f(p.alt,' ft'),f(p.gs,' kt'),movementText(p)].filter(Boolean).join(' · ')}</span>`
      : '<b>Ingen fly</b><span>–</span>';
  }
  layer.clearLayers();
  list.forEach(p=>{
    L.marker([p.lat,p.lon],{icon:planeIcon(p)})
      .bindTooltip(`${localRelevant(p)?'NÆR · ':''}${p.flight||p.reg||p.hex} · ${fNm(p.d)}`,{direction:'top',offset:[0,-15]})
      .on('click',()=>{select(p);render(false)})
      .addTo(layer);
  });
  const nearest=list[0]||null;
  const current=selected&&list.find(p=>p.hex===selected.hex);
  const shown=current||nearest;
  if(shown){
    selected=shown;
    $('cards').innerHTML=`<div class="card ${localRelevant(shown)?'local-card':''}">
      <div class="top"><div>
        <div class="call">${shown.flight||shown.reg||shown.hex||'Ukjent'}</div>
        <div class="muted">${[shown.operator,shown.reg,shown.type,shown.desc].filter(Boolean).join(' · ')||shown.hex}</div><div class="source">${shown.source||''}</div>
        <div class="route">${displayRoute(shown)}</div>
        <div class="muted" style="margin-top:5px">${movementText(shown)}</div>
      </div><div class="dist">${fNm(shown.d)}</div></div>
      <div class="grid">
        <div><span>HØYDE</span><b>${f(shown.alt,' ft')}</b></div>
        <div><span>FART</span><b>${f(shown.gs,' kt')}</b></div>
        <div><span>KURS</span><b>${f(shown.track,'°')}</b></div>
        <div><span>VERT.</span><b>${f(shown.vr,' ft/min')}</b></div>
      </div>
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
