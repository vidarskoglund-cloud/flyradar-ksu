const $=x=>document.getElementById(x);
let planes=[], display=false, selected=null;
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
    vr:a.baro_rate??a.geom_rate,d:dist(s.lat,s.lon,lat,lon)
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
  $('hdist').textContent=fNm(p.d);
  $('halt').textContent=f(p.alt,' ft');
  $('hspd').textContent=f(p.gs,' kt');
  $('htrk').textContent=f(p.track,'°');
  $('hvr').textContent=f(p.vr,' ft/min');
}
function render(autoFit=false){
  const s=settings();
  let q=$('filter').value.toLowerCase();
  let list=planes.filter(p=>!q||[p.flight,p.reg,p.type,p.hex,p.operator,p.desc].join(' ').toLowerCase().includes(q));
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
