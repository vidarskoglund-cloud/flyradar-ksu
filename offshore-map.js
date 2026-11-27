/* Offshore helicopter track overlay. Observed fixes only; never bridge ADS-B gaps.
   Trip data remain in this browser's existing localStorage offshore recorder. */
(function(){
'use strict';
if(typeof L==='undefined'||typeof map==='undefined'||!window.KsuOffshoreCoverage)return;
const GAPS_MS=90*1000,PLATFORM_NEAR_NM=2.5;
const layer=L.layerGroup().addTo(map);
let visible=true,current=null,latestSummary='';
const distanceNm=(a,b,c,d)=>{
 const rad=Math.PI/180;
 const x=Math.sin((c-a)*rad/2)**2+Math.cos(a*rad)*Math.cos(c*rad)*Math.sin((d-b)*rad/2)**2;
 return 3440.065*2*Math.atan2(Math.sqrt(x),Math.sqrt(Math.max(0,1-x)));
};
const valid=x=>Number.isFinite(Number(x?.lat))&&Number.isFinite(Number(x?.lon))&&
 Math.abs(Number(x.lat))<=90&&Math.abs(Number(x.lon))<=180;
function latestTrip(hex){
 return window.KsuOffshoreCoverage.snapshot().filter(t=>t.hex===hex&&Array.isArray(t.points)&&t.points.length)
  .sort((a,b)=>Number(b.lastAt)-Number(a.lastAt))[0]||null;
}
function installations(){
 const sites=[];
 offshoreLayer.eachLayer(marker=>{
  if(!marker.getLatLng)return;
  const point=marker.getLatLng();
  const name=String(marker.getTooltip?.()?.getContent?.()||'Offshoreinstallasjon');
  if(Number.isFinite(point.lat)&&Number.isFinite(point.lng))sites.push({lat:point.lat,lon:point.lng,name});
 });
 return sites;
}
function nearInstallation(trip){
 const sites=installations();
 let best=null;
 for(const site of sites){
  const fixes=trip.points.filter(f=>valid(f)&&Number(f.alt)>=0&&Number(f.alt)<=3000&&
   distanceNm(f.lat,f.lon,site.lat,site.lon)<=PLATFORM_NEAR_NM);
  // Two independent low-altitude observations near the structure: still
  // proximity only, never proof of landing or the declared destination.
  if(fixes.length<2||Number(fixes[fixes.length-1].t)-Number(fixes[0].t)<15000)continue;
  const d=Math.min(...fixes.map(f=>distanceNm(f.lat,f.lon,site.lat,site.lon)));
  if(!best||d<best.distance)best={...site,distance:d};
 }
 return best;
}
const statusText=document.createElement('span');
const control=L.control({position:'topright'});
control.onAdd=function(){
 const box=L.DomUtil.create('div','offshore-tracking-control leaflet-bar');
 box.style.cssText='max-width:250px;background:#0d2035f2;color:#e9f6ff;padding:8px 10px;border:1px solid #55738e;border-radius:8px;box-shadow:0 2px 9px #0018;font:12px system-ui;line-height:1.4';
 const label=document.createElement('label');
 label.style.cssText='display:flex;align-items:center;gap:7px;font-weight:700;cursor:pointer';
 const input=document.createElement('input');input.type='checkbox';input.checked=true;
 input.setAttribute('aria-label','Vis registrert offshorehelikopterspor');
 input.style.cssText='width:16px;height:16px;min-height:0';
 label.append(input,document.createTextNode('Offshorehelikopter · spor'));
 statusText.style.cssText='display:block;color:#9dc9de;font-size:11px;margin-top:4px';
 box.append(label,statusText);
 input.addEventListener('change',()=>{visible=input.checked;render(current);});
 L.DomEvent.disableClickPropagation(box);L.DomEvent.disableScrollPropagation(box);
 return box;
};
control.addTo(map);
function drawSegment(fixes){
 if(fixes.length<2)return;
 L.polyline(fixes.map(f=>[Number(f.lat),Number(f.lon)]),{
  color:'#f59e40',weight:5,opacity:.95,interactive:true
 }).bindTooltip('Registrerte ADS-B-posisjoner · offshorehelikopter',
  {sticky:true}).addTo(layer);
}
function render(p){
 current=p||null;
 layer.clearLayers();
 if(!p||!visible){statusText.textContent=visible?'Velg et helikopter for å se turen.':'Sporing skjult';return;}
 const hex=String(p.hex||'').toLowerCase();
 const trip=latestTrip(hex);
 if(!trip){statusText.textContent='Ingen lokal offshore-tur registrert for valgt fly.';return;}
 const fixes=trip.points.filter(valid).sort((a,b)=>Number(a.t)-Number(b.t));
 let segment=[],gaps=0;
 for(const f of fixes){
  if(segment.length&&Number(f.t)-Number(segment[segment.length-1].t)>GAPS_MS){
   drawSegment(segment);
   const prior=segment[segment.length-1];
   gaps++;
   L.circleMarker([Number(prior.lat),Number(prior.lon)],{
    radius:6,color:'#ff6a5a',fillColor:'#ff6a5a',fillOpacity:1,weight:2
   }).bindTooltip('Siste mottatte posisjon før dekningstap').addTo(layer);
   L.circleMarker([Number(f.lat),Number(f.lon)],{
    radius:6,color:'#ffdf79',fillColor:'#ffdf79',fillOpacity:1,weight:2
   }).bindTooltip('Første mottatte posisjon etter dekningstap').addTo(layer);
   segment=[];
  }
  segment.push(f);
 }
 drawSegment(segment);
 if(fixes.length){
  const first=fixes[0],last=fixes[fixes.length-1];
  L.circleMarker([Number(first.lat),Number(first.lon)],{
   radius:5,color:'#fff',fillColor:'#f59e40',fillOpacity:1,weight:2
  }).bindTooltip('Første registrerte posisjon for turen').addTo(layer);
  L.circleMarker([Number(last.lat),Number(last.lon)],{
   radius:7,color:'#fff',fillColor:'#ff963c',fillOpacity:1,weight:2
  }).bindTooltip('Siste registrerte posisjon for turen').addTo(layer);
 }
 const near=nearInstallation(trip);
 if(near){
  L.circleMarker([near.lat,near.lon],{radius:11,color:'#cdb1ff',weight:3,
   fillColor:'#9e70d6',fillOpacity:.25})
   .bindTooltip('Mulig plattformnærhet: '+near.name+' · landing ikke bekreftet')
   .addTo(layer);
 }
 const count=fixes.length;
 const detail=near?' · Nær '+near.name+' (ikke bekreftet landing)':'';
 statusText.textContent=count+' posisjoner · '+gaps+' dekningsbrudd'+detail;
 latestSummary=statusText.textContent;
}
window.KsuOffshoreMap={render,summary:()=>latestSummary};
render(typeof selected==='undefined'?null:selected);
})();
