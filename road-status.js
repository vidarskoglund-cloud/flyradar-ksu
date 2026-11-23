/* Conservative DATEX notice UI. No unverified road is shown as open. */
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
let snapshot=null,lastError=false,loading=false;
const LAST_DATEX_KEY='ksu-datex-last-good-v1';
try{
 const saved=JSON.parse(localStorage.getItem(LAST_DATEX_KEY)||'null');
 if(saved?.ok&&saved?.roads&&Number.isFinite(Date.parse(saved.checked_at)) &&
    Date.now()-Date.parse(saved.checked_at)<6*60*60*1000){
  snapshot=saved;lastError=true;
 }
}catch(_error){}
const expanded={};

function clean(s){return String(s||'').replace(/\s+/g,' ').trim();}
function shortPlace(place){
 let p=clean(place).split(/\s+-\s+/)[0];
 p=p.replace(/^(?:[RF]v\.?\s*\d+|E\s*\d+)\s+/i,'');
 p=p.replace(/\s+i Kristiansund(?:,.*)?$/i,'');
 p=p.replace(/\s+i Møre og Romsdal(?:,.*)?$/i,'');
 return p.length>42?p.slice(0,39)+'…':p||'Ukjent sted';
}
function category(event){
 const text=clean(event?.message).toLowerCase();
 const type=String(event?.type||'');
 if(/stengt|stengning|closed/.test(text))return 'Stengning meldt';
 if(/veg(?:-|\s*)arbeid|veiarbeid|maintenanceworks/i.test(text+' '+type))return 'Vegarbeid';
 if(/diriger|regulering/.test(text))return 'Trafikkregulering';
 return 'Trafikkmelding';
}
// DATEX validity bounds describe the announced period, not continuous activity.
function eventPhase(event,now=Date.now()){
 const start=Date.parse(event?.start||'');
 const end=Date.parse(event?.end||'');
 if(Number.isFinite(start)&&now<start)return 'planned';
 if(Number.isFinite(end)&&now>end)return 'ended';
 if((Number.isFinite(start)&&now>=start)||
    (Number.isFinite(end)&&now<=end))return 'period';
 return 'unknown';
}
function eventStatus(event){
 const label=category(event);
 const phase=eventPhase(event);
 if(phase==='planned')return 'Planlagt · '+label;
 if(phase==='ended')return 'Avsluttet · '+label;
 if(phase==='period')return label+' · i perioden';
 return label+' · tidspunkt ukjent';
}
function orderedEvents(events){
 const order={period:0,planned:1,unknown:2,ended:3};
 return [...events].sort((a,b)=>order[eventPhase(a)]-order[eventPhase(b)]||
   (Date.parse(a?.start||'')||0)-(Date.parse(b?.start||'')||0));
}
function uniqueEvents(events){
 const results=[],keys=new Set();
 for(const event of events||[]){
  const place=clean(event?.place),message=clean(event?.message);
  const normalized=shortPlace(place).toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
  const key=normalized+'|'+message.toLowerCase().replace(/[^\p{L}\p{N}]/gu,'').slice(0,90);
  // A location may have several records for the same work: group by location
  // and message category without claiming all records are strictly identical.
  const group=normalized+'|'+category(event);
  if(!place||keys.has(key)||keys.has(group))continue;
  keys.add(key);keys.add(group);results.push(event);
 }
 return results;
}
function formatDatexDate(value){
 const date=new Date(value);
 if(!Number.isFinite(date.getTime()))return String(value||'');
 return new Intl.DateTimeFormat('nb-NO',{
  day:'numeric',month:'long',year:'numeric',
  hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZone:'Europe/Oslo'
 }).format(date).replace(' kl. ', ' kl. ');
}
function detailsText(event){
 const parts=[];
 if(event.place)parts.push('Sted: '+clean(event.place));
 if(event.message)parts.push('Melding: '+clean(event.message));
 if(event.type)parts.push('DATEX-type: '+clean(event.type));
 if(event.start)parts.push('Fra: '+formatDatexDate(event.start));
 if(event.end)parts.push('Til: '+formatDatexDate(event.end));
 if(event.validity)parts.push('Gyldighetsstatus: '+clean(event.validity));
 parts.push('Periode: '+({planned:'Planlagt',period:'Innenfor oppgitt periode',ended:'Avsluttet periode',unknown:'Tidspunkt ikke oppgitt'})[eventPhase(event)]);
 parts.push('Registrert i DATEX. Aktiv status er ikke verifisert.');
 return parts.join('\n');
}
function eventLine(event,key,placeLabel){
 const details=document.createElement('details');
 details.className='road-event';
 details.open=Boolean(expanded[key]);
 details.addEventListener('toggle',()=>{expanded[key]=details.open;});
 const summary=document.createElement('summary');
 summary.className='road-status-row';
 const name=document.createElement('span');
 name.className='road-status-name';
 name.textContent=placeLabel;
 const status=document.createElement('span');
 status.className='road-status-unknown';
 status.textContent=eventStatus(event);
 summary.append(name,status);details.append(summary);
 const body=document.createElement('div');
 body.className='road-event-body';
 body.textContent=detailsText(event);
 details.append(body);
 return details;
}
function paint(){
 for(const id of ['road-status-side','road-status']){
  const el=document.getElementById(id);
  if(!el)continue;
  el.replaceChildren();
  for(const road of ROADS){
   const entries=orderedEvents(uniqueEvents(snapshot?.roads?.[road.name]||[]));
   if(entries.length){
    const first=entries[0];
    const item=eventLine(first,id+'|road|'+road.name,road.name);
    item.querySelector('.road-status-unknown').textContent=eventStatus(first);
    if(entries.length>1){
     const body=item.querySelector('.road-event-body');
     body.textContent=entries.map(detailsText).join('\n\n---\n\n');
    }
    el.append(item);
   }
   // Main roads without an explicit DATEX notice stay hidden.
   // An empty result is not proof that a road is open.
  }
  const local=orderedEvents(uniqueEvents(snapshot?.local||[]));
  if(local.length){
   const heading=document.createElement('div');
   heading.className='road-local-heading';heading.textContent='Andre trafikkmeldinger · ikke bekreftet aktive';
   el.append(heading);
   // Always show all local notices in a single live list, without "show more".
   for(const [index,event] of local.entries()){
    el.append(eventLine(event,id+'|local|'+index+'|'+clean(event.place),shortPlace(event.place)));
   }
  }
 }
 for(const summary of document.querySelectorAll('#datex-panel-update')){
  summary.textContent=lastError?(snapshot?'DATEX · sist mottatt':'DATEX utilgjengelig'):
    snapshot?.checked_at?'DATEX · '+new Date(snapshot.checked_at).toLocaleTimeString('nb-NO',{hour:'2-digit',minute:'2-digit'}):
    'DATEX · kontrollerer';
 }
 for(const credit of document.querySelectorAll('.road-status-credit')){
  credit.replaceChildren();
  credit.append(document.createTextNode(
   lastError&&snapshot?'DATEX · eldre registreringer (oppdatering feilet) · ':
   snapshot?.complete?'DATEX · oppdateres hvert 5. minutt · status ikke bekreftet · ':
    snapshot?'DATEX · delvis datasett · ingen treff betyr ikke åpen vei · ':
    'DATEX · status ikke tilgjengelig · '
  ));
  const link=document.createElement('a');link.href=ROAD_TRAFFIC_URL;
  link.target='_blank';link.rel='noopener noreferrer';link.textContent='Vegvesenet';
  credit.append(link);
 }
}
async function refresh(){
 if(loading)return;
 loading=true;
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),35000);
 try{
  const response=await fetch(ENDPOINT,{signal:controller.signal,cache:'no-store'});
  if(!response.ok)throw Error('DATEX unavailable');
  const payload=await response.json();
  if(!payload?.ok||!payload?.roads)throw Error('DATEX invalid response');
  snapshot=payload;lastError=Boolean(payload.stale);
  if(!payload.stale){
   try{localStorage.setItem(LAST_DATEX_KEY,JSON.stringify(payload));}catch(_error){}
  }
  // Never draw old road events as fresh traffic markers.
  if(window.KsuTrafficMap?.update)window.KsuTrafficMap.update(payload.stale?null:snapshot);
 }catch(_error){
  lastError=true;
  // Retain historical notices in the panel, but remove live map markers.
  // Never treat stale events as current traffic restrictions.
  if(window.KsuTrafficMap?.update)window.KsuTrafficMap.update(null);
 }
 finally{clearTimeout(timeout);loading=false;paint();}
}
window.KsuRoadStatus={roads:ROADS,trafficUrl:ROAD_TRAFFIC_URL,paint,refresh,getCurrentSnapshot:()=>!lastError&&snapshot&&!snapshot.stale?snapshot:null};
paint();refresh();setInterval(refresh,FIVE_MINUTES);
})();
