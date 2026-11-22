(function(){
'use strict';
const ENDPOINT='https://flyradar-ksu.vidar-skoglund.workers.dev/norway-aircraft';
const REFRESH_MS=10*60*1000;
const map=L.map('norway-map',{zoomControl:true,preferCanvas:true});
map.fitBounds([[57.7,3.9],[71.7,31.0]],{padding:[25,25]});
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
 maxZoom:17,attribution:'&copy; OpenStreetMap-bidragsytere'
}).addTo(map);
const markers=L.layerGroup().addTo(map);
const count=document.getElementById('aircraft-count');
const coverage=document.getElementById('coverage-status');
const updated=document.getElementById('last-updated');
function safeNumber(value){
 if(value===null||value===undefined||value==='')return null;
 const n=Number(value);return Number.isFinite(n)?n:null;
}
function aircraftPopup(a){
 const content=document.createElement('div');
 const title=document.createElement('b');
 title.textContent=a.flight||a.r||a.hex||'Ukjent fly';
 content.append(title);
 for(const [key,val] of [
  ['Registrering',a.r],['Flytype',a.t],
  ['Høyde',typeof a.alt_baro==='string'&&a.alt_baro==='ground'?'På bakken':
    safeNumber(a.alt_baro)!==null?Math.round(a.alt_baro)+' fot':'–'],
  ['Fart',safeNumber(a.gs)!==null?Math.round(a.gs)+' knop':'–'],
  ['Kurs',safeNumber(a.track)!==null?Math.round(a.track)+'°':'–']
 ]){
  if(val===null||val===undefined||val==='')continue;
  const line=document.createElement('div');
  const label=document.createElement('strong');label.textContent=key+': ';
  line.append(label,document.createTextNode(String(val)));content.append(line);
 }
 const src=document.createElement('small');src.textContent='ADS-B · adsb.fi';
 content.append(src);return content;
}
function draw(aircraft){
 markers.clearLayers();
 let total=0;
 for(const a of aircraft){
  const lat=safeNumber(a.lat),lon=safeNumber(a.lon);
  if(lat===null||lon===null||lat<57||lat>72.5||lon<3||lon>32)continue;
  const heading=safeNumber(a.track);
  const angle=heading===null?0:((heading%360)+360)%360;
  const icon=L.divIcon({className:'',
    html:'<div class="aircraft-pin" style="transform:rotate('+angle+'deg)">✈</div>',
    iconSize:[24,24],iconAnchor:[12,12]});
  const label=a.flight||a.r||a.hex||'Fly';
  L.marker([lat,lon],{icon,title:label}).bindPopup(aircraftPopup(a)).addTo(markers);
  total++;
 }
 return total;
}
async function update(){
 try{
  const response=await fetch(ENDPOINT,{cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(40000)});
  if(!response.ok)throw new Error('HTTP '+response.status);
  const data=await response.json();
  if(!data?.ok||!Array.isArray(data.ac))throw new Error('Ugyldig data');
  const n=draw(data.ac);
  count.textContent=n+' fly i Norgesområdet';
  const regions=Number(data.regions_completed)||0;
  coverage.textContent=data.stale?'Eldre datagrunnlag · prøver igjen':
    data.partial?'Delvis dekning ('+regions+' av '+data.regions_total+' områder)':
    'Seks søkeområder · inkluderer Bergen og Gardermoen';
  const date=Date.parse(data.generated_at||'');
  updated.textContent='Siste ADS-B-søk: '+(Number.isFinite(date)?
    new Date(date).toLocaleTimeString('no-NO',{hour:'2-digit',minute:'2-digit'}):'ukjent');
 }catch(e){
  if(!markers.getLayers().length)count.textContent='Flydata er ikke tilgjengelige nå';
  coverage.textContent='Midlertidig feil i Norgesoversikten – forsøker igjen senere';
 }
}
window.KsuNorwayRadar={update,draw,safeNumber};
update();
setInterval(update,REFRESH_MS);
})();
