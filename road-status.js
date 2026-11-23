/* Statens vegvesen DATEX II 3.1 – conservative road notices.
 * A missing or unverified DATEX record is NEVER an "open" road status.
 * Upstream authentication stays in the Cloudflare Worker. */
(function(){
'use strict';
const ROADS=[
 {name:'Freifjordtunnelen',kind:'Tunnel',route:'Rv. 70'},
 {name:'Atlanterhavstunnelen',kind:'Tunnel',route:'Fv. 64'},
 {name:'Nordsundbrua',kind:'Bru',route:'Kristiansund'},
 {name:'Omsundbrua',kind:'Bru',route:'Kristiansund'},
 {name:'Bergsøysundbrua',kind:'Bru',route:'Krifast'}
];
const ROAD_TRAFFIC_URL='https://www.vegvesen.no/trafikk/';
const ENDPOINT='https://flyradar-ksu.vidar-skoglund.workers.dev/datex/roads';
const FIVE_MINUTES=5*60*1000;
let snapshot=null;
let lastError=false;
let loading=false;

function labelFor(item){
 const text=String(item.message||'').trim();
 const label=text || String(item.type||'Trafikkmelding').replace(/([a-z])([A-Z])/g,'$1 $2');
 return label.length>115 ? label.slice(0,112)+'…' : label;
}
function paint(){
 for(const id of ['road-status-side','road-status']){
  const el=document.getElementById(id);if(!el)continue;
  el.replaceChildren();
  for(const road of ROADS){
   const entries=Array.isArray(snapshot?.roads?.[road.name])?snapshot.roads[road.name]:[];
   const row=document.createElement('div');row.className='road-status-row';
   const name=document.createElement('div');name.className='road-status-name';
   name.textContent=road.name;
   const status=document.createElement('span');status.className='road-status-unknown';
   status.textContent=entries.length ? 'DATEX-melding registrert' :
     lastError ? 'Data utilgjengelig' :
     snapshot?.complete ? 'Ingen stedfestet melding' :
     snapshot ? 'Ufullstendig datagrunnlag' : 'Kontrollerer…';
   if(entries.length){
     const details=entries.map(e=>labelFor(e)).join(' | ');
     status.title=details+' – ikke bekreftet aktiv';
   }
   row.append(name,status);el.append(row);
  }
  const local=Array.isArray(snapshot?.local)?snapshot.local.slice(0,5):[];
  if(local.length){
   const heading=document.createElement('div');
   heading.className='road-status-row';
   const caption=document.createElement('strong');
   caption.textContent='Registrert i Kristiansund (ikke bekreftet aktiv)';
   caption.style.fontSize='10px';
   heading.append(caption);el.append(heading);
   for(const event of local){
    const row=document.createElement('div');row.className='road-status-row';
    const place=document.createElement('div');place.className='road-status-name';
    place.textContent=event.place;
    const message=document.createElement('span');message.className='road-status-unknown';
    message.textContent=labelFor(event);
    message.title=event.message||'DATEX-registrering';
    row.append(place,message);el.append(row);
   }
  }
 }
 for(const summary of document.querySelectorAll('details.road-status-side > summary > small')){
  summary.textContent=lastError?'DATEX utilgjengelig':
   snapshot?.checked_at?'DATEX · '+new Date(snapshot.checked_at).toLocaleTimeString('nb-NO',{hour:'2-digit',minute:'2-digit'}):
   'DATEX · kontrollerer';
 }
 for(const credit of document.querySelectorAll('.road-status-credit')){
  credit.replaceChildren();
  credit.append(document.createTextNode(
   snapshot?.complete ? 'DATEX · oppdateres hvert 5. minutt · meldinger ikke bekreftet aktive · ' :
   snapshot ? 'DATEX · delvis datasett · meldinger ikke bekreftet aktive · ' :
   'DATEX · status ikke tilgjengelig · '
  ));
  const link=document.createElement('a');
  link.href=ROAD_TRAFFIC_URL;link.target='_blank';link.rel='noopener noreferrer';
  link.textContent='Vegvesenet';credit.append(link);
 }
}
async function refresh(){
 if(loading)return;
 loading=true;
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),35000);
 try{
  const response=await fetch(ENDPOINT,{signal:controller.signal,cache:'no-store'});
  if(!response.ok)throw Error('DATEX unavailable');
  const payload=await response.json();
  if(!payload?.ok||!payload?.roads)throw Error('DATEX invalid response');
  snapshot=payload;lastError=false;
 }catch(_error){lastError=true;snapshot=null;}
 finally{clearTimeout(timeout);loading=false;paint();}
}
window.KsuRoadStatus={roads:ROADS,trafficUrl:ROAD_TRAFFIC_URL,paint,refresh};
paint();
refresh();
setInterval(refresh,FIVE_MINUTES);
})();
