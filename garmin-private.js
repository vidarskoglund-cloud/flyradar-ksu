(function(){
'use strict';
// Privacy-first Garmin integration: no server requests, no automatic sharing.
// The user imports a Garmin MapShare KML file into this browser tab only.
const input=document.getElementById('garmin-kml-file');
const toggle=document.getElementById('garmin-show');
const clear=document.getElementById('garmin-clear');
const link=document.getElementById('garmin-mapshare-url');
const open=document.getElementById('garmin-open');
const status=document.getElementById('garmin-status');
if(!input||!toggle||!clear||!status||typeof L==='undefined'||typeof map==='undefined')return;
const group=L.layerGroup().addTo(map);
let snapshot=null;
const setStatus=text=>{status.textContent=text;};
const coordinate=value=>{
 const parts=String(value||'').trim().split(/[ ,\t\n]+/).map(Number);
 if(parts.length<2||!Number.isFinite(parts[0])||!Number.isFinite(parts[1])||
    Math.abs(parts[0])>180||Math.abs(parts[1])>90)return null;
 return [parts[1],parts[0]];
};
function parseGarminKml(xml){
 if(xml.length>3e6)throw Error('KML-filen er for stor (maks 3 MB)');
 if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw Error('DTD/entiteter er ikke tillatt');
 const doc=new DOMParser().parseFromString(xml,'application/xml');
 if(doc.querySelector('parsererror'))throw Error('Ugyldig KML-fil');
 if(!doc.documentElement||doc.documentElement.localName!=='kml')throw Error('Dette er ikke en KML-fil');
 const points=[],lines=[];
 const elements=name=>Array.from(doc.getElementsByTagName('*')).filter(n=>n.localName===name);
 const descendants=(n,name)=>Array.from(n.getElementsByTagName('*')).filter(e=>e.localName===name);
 for(const placemark of elements('Placemark').slice(0,3000)){
  const timestamp=descendants(placemark,'when').map(n=>n.textContent?.trim()).find(Boolean)||'';
  const label=descendants(placemark,'name')[0]?.textContent?.trim().slice(0,80)||'inReach';
  for(const point of descendants(placemark,'Point')){
   const pos=descendants(point,'coordinates').map(n=>coordinate(n.textContent)).find(Boolean);
   if(pos)points.push({pos,timestamp,label});
  }
  for(const line of descendants(placemark,'LineString')){
   const raw=descendants(line,'coordinates')[0]?.textContent||'';
   const coords=raw.trim().split(/\s+/).slice(0,5000).map(coordinate).filter(Boolean);
   if(coords.length>=2)lines.push(coords);
  }
  for(const track of descendants(placemark,'Track')){
   const coords=descendants(track,'coord').slice(0,5000).map(n=>coordinate(n.textContent)).filter(Boolean);
   if(coords.length>=2)lines.push(coords);
   const times=descendants(track,'when').map(n=>n.textContent?.trim());
   for(let i=0;i<coords.length;i++)points.push({pos:coords[i],timestamp:times[i]||'',label});
  }
 }
 if(!points.length&&!lines.length)throw Error('Fant ingen gyldige posisjoner i KML-filen');
 return {points,lines};
}
function render(){
 group.clearLayers();
 if(!toggle.checked||!snapshot)return;
 const {points,lines}=snapshot;
 for(const coords of lines)L.polyline(coords,{color:'#c78cff',weight:3,opacity:.87}).addTo(group);
 const ordered=points.slice().sort((a,b)=>(Date.parse(a.timestamp)||0)-(Date.parse(b.timestamp)||0));
 const last=ordered[ordered.length-1]||{pos:lines[lines.length-1]?.slice(-1)[0],label:'inReach',timestamp:''};
 if(!last?.pos)return;
 const label=String(last.label||'inReach');
 L.circleMarker(last.pos,{radius:9,color:'#fff',weight:2,fillColor:'#9b5de5',fillOpacity:.98})
  .bindTooltip('inReach · siste importerte posisjon').addTo(group);
 const pop=L.popup().setLatLng(last.pos);
 const detail=document.createElement('div');
 const head=document.createElement('strong');head.textContent='Garmin inReach · '+label;
 const time=document.createElement('div');
 time.textContent=last.timestamp?'Posisjonstid: '+last.timestamp:'Tidspunkt ikke oppgitt';
 detail.append(head,time);
 pop.setContent(detail);
 group.addLayer(pop);
 map.panTo(last.pos,{animate:false});
}
input.addEventListener('change',async()=>{
 const file=input.files?.[0];
 if(!file)return;
 try{
  if(file.size>3e6)throw Error('Filen er større enn 3 MB');
  snapshot=parseGarminKml(await file.text());
  toggle.checked=true;
  render();
  setStatus('Importert lokalt: '+snapshot.points.length+' posisjoner, '+snapshot.lines.length+' sporlinjer. Ingen data er sendt til serveren.');
 }catch(e){setStatus('Import mislyktes: '+(e.message||e));}
 finally{input.value='';}
});
toggle.addEventListener('change',render);
clear.addEventListener('click',()=>{
 snapshot=null;group.clearLayers();toggle.checked=false;
 setStatus('Garmin-spor er fjernet fra kartet og nettleserminnet.');
});
open?.addEventListener('click',()=>{
 const value=String(link?.value||'').trim();
 if(!/^https:\/\/(?:share\.garmin\.com|inreach\.garmin\.com|explore\.garmin\.com)\//i.test(value)){
  setStatus('Lim inn en MapShare-lenke fra Garmin (HTTPS).');return;
 }
 window.open(value,'_blank','noopener,noreferrer');
});
})();
