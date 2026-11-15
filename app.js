const $=x=>document.getElementById(x);
let planes=[], display=false, selected=null, avinorFlights=[], lastGoodPlanes=[], sourceState={adsb:'ukjent',apl:'ukjent'};
const routeCache=new Map();
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
let home=L.circleMarker([63.1118,7.8245],{radius:7,color:'#6ee7ff',weight:3,fillColor:'#08111f',fillOpacity:1}).bindTooltip('KSU / Kvernberget').addTo(map);

const rad=x=>x*Math.PI/180;
const nm=km=>km/1.852;
function dist(a,b,c,d){let R=6371,x=rad(c-a),y=rad(d-b),q=Math.sin(x/2)**2+Math.cos(rad(a))*Math.cos(rad(c))*Math.sin(y/2)**2;return 2*R*Math.atan2(Math.sqrt(q),Math.sqrt(1-q))}
function f(v,u=''){return(v===undefined||v===null||v==='ground')?'–':Math.round(+v)+u}
function fNm(km){return km==null?'–':nm(km).toFixed(1)+' NM'}
function localRelevant(p){
  const distanceNm=nm(p.d);
  const alt=typeof p.alt==='number'?p.alt:99999;
  return distanceNm<=30 && alt<=25000;
}
function settings(){return{lat:+$('lat').value,lon:+$('lon').value,r:+$('radius').value,area:$('area')?.value||'airport'}}
function save(){localStorage.setItem('ksuFly',JSON.stringify(settings()))}
function load(){try{let s=JSON.parse(localStorage.getItem('ksuFly')||'{}');if(s.lat)$('lat').value=s.lat;if(s.lon)$('lon').value=s.lon;if(s.r)$('radius').value=s.r;if(s.area&&$('area'))$('area').value=s.area}catch(e){}}
function normalize(a,s){
  let lat=a.lat,lon=a.lon;
  return{
    hex:a.hex||'',flight:(a.flight||'').trim(),reg:a.r||'',type:a.t||'',
    operator:a.ownOp||a.operator||'',desc:a.desc||'',lat,lon,
    alt:a.alt_baro??a.alt_geom,gs:a.gs,track:a.track??a.true_heading??a.mag_heading,
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
function destinationPoint(lat,lon,distanceNm,bearingDeg){
  const R=6371, d=distanceNm*1.852/R, br=rad(bearingDeg), p1=rad(lat), l1=rad(lon);
  const p2=Math.asin(Math.sin(p1)*Math.cos(d)+Math.cos(p1)*Math.sin(d)*Math.cos(br));
  const l2=l1+Math.atan2(Math.sin(br)*Math.sin(d)*Math.cos(p1),Math.cos(d)-Math.sin(p1)*Math.sin(p2));
  return [p2*180/Math.PI,((l2*180/Math.PI+540)%360)-180];
}
function updateRangeRings(s){
  rangeLayer.clearLayers();
  const overview=+s.r>=150;
  [10,25,50].forEach(n=>{
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
    if(!overview){
      const pos=destinationPoint(s.lat,s.lon,n,0);
      L.marker(pos,{interactive:false,icon:L.divIcon({
        className:'range-label-wrap',
        html:`<div class="range-label ${active?'active':''}">${n} NM</div>`,
        iconSize:[58,20],iconAnchor:[29,10]
      })}).addTo(rangeLayer);
    }
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
function followNearest(list,s){
  const local=list.filter(localRelevant).sort((a,b)=>a.d-b.d);
  const p=local[0];
  if(!p){ applyMapLevel(s); return; }

  const airport=[63.1118,7.8245];
  const plane=[p.lat,p.lon];
  const dNm=nm(p.d);

  let maxZoom=9;
  if(dNm<=20)maxZoom=10;
  if(dNm<=10)maxZoom=11;
  if(dNm<=5)maxZoom=12;
  if(dNm<=2)maxZoom=13;

  const bounds=L.latLngBounds([airport,plane]);
  if(dNm<0.5){
    map.setView(plane,14);
  }else{
    map.fitBounds(bounds,{padding:[70,70],maxZoom});
  }
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
async function enrichRoutes(list){
  const wanted=list.filter(p=>p.flight && !routeCache.has(p.flight));
  if(wanted.length){
    try{
      const resp=await fetch('https://api.adsb.lol/api/0/routeset',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({planes:wanted.slice(0,100).map(p=>({callsign:p.flight,lat:p.lat,lng:p.lon}))})
      });
      if(resp.ok){
        const rows=await resp.json();
        if(Array.isArray(rows)){
          rows.forEach(r=>{if(r&&r.callsign)routeCache.set(String(r.callsign).trim(),r)});
        }
      }
    }catch(e){}
  }
  let changed=false;
  list.forEach(p=>{
    const r=p.flight?routeCache.get(p.flight):null;
    const t=routeText(r);
    p.routeData=r||null;
    if(p.route!==t){p.route=t;changed=true}
  });
  if(changed)render(false);
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
async function refresh(){
  let s=settings();save();
  $('status').textContent='Henter…';$('status').className='muted';
  home.setLatLng([s.lat,s.lon]);
  updateRangeRings(s);
  try{
    const adsbUrl=`https://api.adsb.lol/v2/point/${s.lat}/${s.lon}/${s.r}`;
    const aplUrl=`https://api.airplanes.live/v2/point/${s.lat}/${s.lon}/${s.r}`;
    const [adsbRes,aplRes]=await Promise.allSettled([fetchJson(adsbUrl),fetchJson(aplUrl)]);
    sourceState.adsb=adsbRes.status==='fulfilled'?'OK':'feil';
    sourceState.apl=aplRes.status==='fulfilled'?'OK':'feil';
    const adsbData=adsbRes.status==='fulfilled'?(adsbRes.value.ac||[]):[];
    const aplData=aplRes.status==='fulfilled'?(aplRes.value.ac||[]):[];
    const anySourceOk=adsbRes.status==='fulfilled'||aplRes.status==='fulfilled';
    if(!anySourceOk){
      if(lastGoodPlanes.length){
        planes=lastGoodPlanes.map(p=>({...p}));
        const localCount=planes.filter(localRelevant).length;
        $('status').textContent=`${localCount} fly i området · viser sist kjente data`;
        $('status').className='muted';
        render(false);
        loadAvinor();
        return;
      }
      throw new Error(`adsb.lol: ${sourceState.adsb} · Airplanes.live: ${sourceState.apl}`);
    }
    const merged=mergeAircraft(adsbData,aplData);
    planes=merged.filter(a=>a.lat!=null&&a.lon!=null).map(a=>normalize(a,s)).sort((a,b)=>a.d-b.d);
    lastGoodPlanes=planes.map(p=>({...p}));
    const localCount=planes.filter(localRelevant).length;
    const followed=planes.filter(localRelevant).sort((a,b)=>a.d-b.d)[0];
    const followText=followed?' · følger '+(followed.flight||followed.reg||followed.hex):'';
    $('status').textContent=`${localCount} fly i området${followText} · ${new Date().toLocaleTimeString('no-NO',{hour:'2-digit',minute:'2-digit'})}`;
    $('status').className='ok';
    render(true);
    enrichRoutes(planes);
    loadAvinor();
  }catch(e){
    $('status').textContent='Feil: '+e.message;$('status').className='err';
    if(!lastGoodPlanes.length){
      $('cards').innerHTML='<div class="card">Kunne ikke hente live-data. Kontroller nettverk eller prøv Oppdater igjen.</div>';
    }
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
function select(p){
  if(!p)return;
  selected=p;
  drawRoute(p);
  $('hcall').textContent=p.flight||p.reg||p.hex||'Ukjent';
  $('hmeta').textContent=[p.operator,p.reg,p.type,p.desc].filter(Boolean).join(' · ')||p.hex;
  $('hroute').textContent=p.route||'Henter rute…';
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
  $('count').textContent=list.filter(localRelevant).length;
  $('closest').textContent=list[0]?fNm(list[0].d):'–';
  $('updated').textContent=new Date().toLocaleTimeString('no-NO');
  layer.clearLayers();
  list.forEach(p=>{
    L.marker([p.lat,p.lon],{icon:planeIcon(p)})
      .bindTooltip(`${localRelevant(p)?'LOKAL · ':''}${p.flight||p.reg||p.hex} · ${fNm(p.d)}`,{direction:'top',offset:[0,-15]})
      .on('click',()=>select(p))
      .addTo(layer);
  });
  $('cards').innerHTML=list.map(p=>`<div class="card ${localRelevant(p)?'local-card':''}" data-h="${p.hex}">
    <div class="top"><div>
      <div class="call">${p.flight||p.reg||p.hex||'Ukjent'}</div>
      <div class="muted">${[p.operator,p.reg,p.type,p.desc].filter(Boolean).join(' · ')||p.hex}</div><div class="source">${p.source||''}</div>
      <div class="route">${p.route||'Henter rute…'}</div>
    </div><div class="dist">${fNm(p.d)}</div></div>
    <div class="grid">
      <div><span>HØYDE</span><b>${f(p.alt,' ft')}</b></div>
      <div><span>FART</span><b>${f(p.gs,' kt')}</b></div>
      <div><span>KURS</span><b>${f(p.track,'°')}</b></div>
      <div><span>VERT.</span><b>${f(p.vr,' ft/min')}</b></div>
    </div>
  </div>`).join('');
  document.querySelectorAll('[data-h]').forEach(e=>e.onclick=()=>select(list.find(p=>p.hex===e.dataset.h)));
  if(list.length && (!selected || !list.some(p=>p.hex===selected.hex))) select(list.find(localRelevant)||list[0]);
  else if(selected){const current=list.find(p=>p.hex===selected.hex);if(current)select(current)}
  if(!list.length)routeLayer.clearLayers();
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
if('serviceWorker' in navigator){navigator.serviceWorker.getRegistrations().then(rs=>rs.forEach(r=>r.unregister()));}
