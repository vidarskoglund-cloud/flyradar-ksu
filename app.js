const $=x=>document.getElementById(x);
let planes=[], display=false, selected=null;
const routeCache=new Map();
let map=L.map('map',{zoomControl:true}).setView([63.1118,7.8245],7);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18}).addTo(map);
let layer=L.layerGroup().addTo(map);
let home=L.circleMarker([63.1118,7.8245],{radius:7,color:'#6ee7ff',weight:3,fillColor:'#08111f',fillOpacity:1}).bindTooltip('KSU / Kvernberget').addTo(map);

const rad=x=>x*Math.PI/180;
const nm=km=>km/1.852;
function dist(a,b,c,d){let R=6371,x=rad(c-a),y=rad(d-b),q=Math.sin(x/2)**2+Math.cos(rad(a))*Math.cos(rad(c))*Math.sin(y/2)**2;return 2*R*Math.atan2(Math.sqrt(q),Math.sqrt(1-q))}
function f(v,u=''){return(v===undefined||v===null||v==='ground')?'–':Math.round(+v)+u}
function fNm(km){return km==null?'–':nm(km).toFixed(1)+' NM'}
function settings(){return{lat:+$('lat').value,lon:+$('lon').value,r:+$('radius').value}}
function save(){localStorage.setItem('ksuFly',JSON.stringify(settings()))}
function load(){try{let s=JSON.parse(localStorage.getItem('ksuFly')||'{}');if(s.lat)$('lat').value=s.lat;if(s.lon)$('lon').value=s.lon;if(s.r)$('radius').value=s.r}catch(e){}}
function normalize(a,s){
  let lat=a.lat,lon=a.lon;
  return{
    hex:a.hex||'',flight:(a.flight||'').trim(),reg:a.r||'',type:a.t||'',
    operator:a.ownOp||a.operator||'',desc:a.desc||'',lat,lon,
    alt:a.alt_baro??a.alt_geom,gs:a.gs,track:a.track??a.true_heading??a.mag_heading,
    vr:a.baro_rate??a.geom_rate,d:dist(s.lat,s.lon,lat,lon),route:null
  }
}
function planeIcon(p){
  const tr=Number.isFinite(+p.track)?+p.track:0;
  return L.divIcon({
    className:'plane-wrap',
    html:`<div class="plane-marker" style="transform:rotate(${tr}deg)">✈</div>`,
    iconSize:[34,34],iconAnchor:[17,17]
  });
}
function fitMap(list,s){
  const pts=[[s.lat,s.lon],...list.map(p=>[p.lat,p.lon])];
  if(pts.length>1) map.fitBounds(L.latLngBounds(pts),{padding:[45,45],maxZoom:9});
  else map.setView([s.lat,s.lon],7);
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
    if(p.route!==t){p.route=t;changed=true}
  });
  if(changed)render(false);
}
async function refresh(){
  let s=settings();save();
  $('status').textContent='Henter…';$('status').className='muted';
  home.setLatLng([s.lat,s.lon]);
  try{
    const upstream=`https://api.adsb.lol/v2/point/${s.lat}/${s.lon}/${s.r}`;
    const url='https://proxy.cors.dev/'+upstream;
    let r=await fetch(url,{credentials:'omit'});
    if(!r.ok)throw new Error('HTTP '+r.status);
    let j=await r.json();
    planes=(j.ac||[]).filter(a=>a.lat!=null&&a.lon!=null).map(a=>normalize(a,s)).sort((a,b)=>a.d-b.d);
    $('status').textContent=planes.length+' fly';$('status').className='ok';
    render(true);
    enrichRoutes(planes);
  }catch(e){
    $('status').textContent='Feil: '+e.message;$('status').className='err';
    $('cards').innerHTML='<div class="card">Kunne ikke hente live-data. Prøv Oppdater igjen.</div>';
  }
}
function select(p){
  if(!p)return;
  selected=p;
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
  let q=$('filter').value.toLowerCase();
  let list=planes.filter(p=>!q||[p.flight,p.reg,p.type,p.hex,p.operator,p.desc,p.route].join(' ').toLowerCase().includes(q));
  $('count').textContent=list.length;
  $('closest').textContent=list[0]?fNm(list[0].d):'–';
  $('updated').textContent=new Date().toLocaleTimeString('no-NO');
  layer.clearLayers();
  list.forEach(p=>{
    L.marker([p.lat,p.lon],{icon:planeIcon(p)})
      .bindTooltip(`${p.flight||p.reg||p.hex} · ${fNm(p.d)}`,{direction:'top',offset:[0,-15]})
      .on('click',()=>select(p))
      .addTo(layer);
  });
  $('cards').innerHTML=list.map(p=>`<div class="card" data-h="${p.hex}">
    <div class="top"><div>
      <div class="call">${p.flight||p.reg||p.hex||'Ukjent'}</div>
      <div class="muted">${[p.operator,p.reg,p.type,p.desc].filter(Boolean).join(' · ')||p.hex}</div>
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
  if(list.length && (!selected || !list.some(p=>p.hex===selected.hex))) select(list[0]);
  else if(selected){const current=list.find(p=>p.hex===selected.hex);if(current)select(current)}
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
$('refresh').onclick=refresh;
$('filter').oninput=()=>render(false);
$('radius').onchange=refresh;
$('save').onclick=refresh;
$('mode').onclick=toggleDisplay;
load();refresh();setInterval(refresh,180000);
if('serviceWorker' in navigator){navigator.serviceWorker.getRegistrations().then(rs=>rs.forEach(r=>r.unregister()));}
