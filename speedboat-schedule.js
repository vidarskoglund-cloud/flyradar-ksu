/* Kristiansund hurtigbåtkai: AtB line 800, planned and real-time stop calls
 * from Entur. No ship/vessel assignment is inferred from AIS or stop times.
 * Entur APIs are open under NLOD and require an ET-Client-Name header. */
(function(){
'use strict';
const CLIENT='vidarskoglund-trafikkradar';
const REFRESH_MS=10*60*1000;
const ENTUR='https://api.entur.io';
const WAIT_MS=12000;
let lastCalls=null,lastUpdated=0,stopId=null;
function text(value){return String(value??'').trim();}
function clock(value){
 const time=Date.parse(text(value));
 return Number.isFinite(time)?new Date(time).toLocaleTimeString('no-NO',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Oslo'}):'–';
}
function escapeHtml(value){
 return text(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}
function pickKristiansundQuay(features){
 const choices=(features||[]).filter(f=>{
  const p=f?.properties||{};
  const n=text(p.names?.default||p.name||p.names?.display||p.label).toLowerCase();
  const id=text(p.id||f.id);
  const coordinates=f?.geometry?.coordinates;
  // Require the named speedboat quay and a bounded geographic match.
  return /^NSR:StopPlace:\d+$/.test(id)&&
    n.includes('kristiansund')&&/hurtigbåt|hurtigbat/i.test(n)&&
    Array.isArray(coordinates)&&Math.abs(Number(coordinates[1])-63.112)<0.12&&
    Math.abs(Number(coordinates[0])-7.73)<0.20;
 });
 return choices.length===1?text(choices[0].properties.id||choices[0].id):null;
}
async function fetchJson(url,init={}){
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),WAIT_MS);
 try{
  const response=await fetch(url,{...init,credentials:'omit',signal:controller.signal,
   headers:{'ET-Client-Name':CLIENT,...init.headers}});
  if(!response.ok)throw new Error('HTTP '+response.status);
  return await response.json();
 }finally{clearTimeout(timer);}
}
async function findStop(){
 if(stopId)return stopId;
 const url=ENTUR+'/geocoder/v3/autocomplete?'+new URLSearchParams({
  q:'Kristiansund hurtigbåtkai',lang:'no',limit:'8',layers:'stopPlace'
 });
 const info=await fetchJson(url);
 stopId=pickKristiansundQuay(info.features);
 if(!stopId){
  // Names can be indexed differently; a second short search is safe because
  // the same strict name + geographic coordinates are required for acceptance.
  const fallback=await fetchJson(ENTUR+'/geocoder/v3/autocomplete?'+
    new URLSearchParams({q:'Kristiansund',lang:'no',limit:'30',layers:'stopPlace'}));
  stopId=pickKristiansundQuay(fallback.features);
 }
 if(!stopId)throw new Error('Fant ikke entydig stoppested for Kristiansund hurtigbåtkai');
 return stopId;
}
const BOARD_QUERY=`query KristiansundSpeedboat($id:String!){
 stopPlace(id:$id){
  id name
  estimatedCalls(timeRange:86400,numberOfDepartures:80,arrivalDeparture:both){
   aimedArrivalTime expectedArrivalTime actualArrivalTime
   aimedDepartureTime expectedDepartureTime actualDepartureTime
   forAlighting forBoarding realtime cancellation predictionInaccurate
   serviceJourney{line{publicCode transportMode}}
   destinationDisplay{frontText}
  }
 }
}`;
async function fetchBoard(){
 const id=await findStop();
 const json=await fetchJson(ENTUR+'/journey-planner/v3/graphql',{
  method:'POST',
  headers:{'Content-Type':'application/json'},
  body:JSON.stringify({query:BOARD_QUERY,variables:{id}})
 });
 if(json.errors?.length)throw new Error('Entur-skjema: '+text(json.errors[0]?.message));
 if(!json.data?.stopPlace)throw new Error('Entur fant ikke hurtigbåtkaia');
 return json.data.stopPlace.estimatedCalls||[];
}
function toRows(calls,now=Date.now()){
 const results=[];
 for(const call of calls||[]){
  const line=call?.serviceJourney?.line;
  if(text(line?.publicCode)!=='800')continue;
  if(call.cancellation){
   // The board covers upcoming sailings, not cancelled trips.
   continue;
  }
  if(line.transportMode&&line.transportMode!=='water')continue;
  const label=text(call.destinationDisplay?.frontText)||'Rute 800';
  for(const [direction,allowed,aimed,expected,actual] of [
   ['ANK',call.forAlighting,call.aimedArrivalTime,call.expectedArrivalTime,call.actualArrivalTime],
   ['AVG',call.forBoarding,call.aimedDepartureTime,call.expectedDepartureTime,call.actualDepartureTime]]){
   if(allowed===false||actual)continue;
   const planned=Date.parse(text(aimed));
   const latest=Date.parse(text(expected));
   const hasPlan=Number.isFinite(planned);
   if(!hasPlan)continue;
   const changed=Boolean(call.realtime&&!call.predictionInaccurate&&Number.isFinite(latest)&&
     Math.abs(latest-planned)>=60000);
   const display=changed?latest:planned;
   if(display<now-5*60000||display>now+26*3600000)continue;
   results.push({direction,when:display,planned,changed,
    realtime:Boolean(call.realtime&&!call.predictionInaccurate),label,
    delayed:changed&&latest>planned,code:text(line.publicCode)});
  }
 }
 return results.sort((a,b)=>a.when-b.when)
  .filter((row,i,all)=>all.findIndex(r=>r.direction===row.direction&&r.when===row.when&&r.label===row.label)===i)
  .slice(0,4);
}
function rowHtml(row){
 const tag=row.direction==='ANK'?'Ankomst':'Avgang';
 const note=row.changed
   ?(row.delayed?'Forsinket · ':'Tid endret · ')+'planlagt '+clock(row.planned)
   :(row.realtime?'Sanntidsdata · ':'Planlagt tid · ')+tag.toLowerCase();
 return `<div class="speedboat-row ${row.direction==='ANK'?'is-arrival':''}">
  <span class="speedboat-direction">${row.direction}</span>
  <div class="speedboat-main"><strong>800</strong> <small>${escapeHtml(tag)} · ${escapeHtml(row.label)}</small>
  <small>${escapeHtml(note)}</small></div>
  <div class="speedboat-clock"><strong>${clock(row.when)}</strong>
   <small>${row.changed?'Ny tid':'Planlagt'}</small></div>
 </div>`;
}
function render(){
 const nodes=['speedboat-list-side','speedboat-list'].map(id=>document.getElementById(id)).filter(Boolean);
 if(!nodes.length)return;
 const rows=toRows(lastCalls||[]);
 const html=lastCalls===null
  ?'<div class="schedule-empty">Henter rutetider fra Entur…</div>'
  :rows.length?rows.map(rowHtml).join('')
   :'<div class="schedule-empty">Ingen kommende avganger eller ankomster for rute 800 registrert.</div>';
 for(const node of nodes)node.innerHTML=html;
}
async function refresh(){
 try{
  const calls=await fetchBoard();
  lastCalls=calls;
  lastUpdated=Date.now();
  render();
 }catch(err){
  console.warn('Hurtigbåtruter fra Entur er ikke tilgjengelige:',err);
  if(lastCalls&&Date.now()-lastUpdated<30*60*1000){
   render();
   // Warn about stale information rather than silently presenting old results.
   for(const node of [document.getElementById('speedboat-list-side'),document.getElementById('speedboat-list')]){
    if(node)node.insertAdjacentHTML('beforeend','<small class="speedboat-credit">Siste rutekontroll mislyktes. Tidene kan være utdaterte.</small>');
   }
  }else{
   lastCalls=null;
   for(const node of [document.getElementById('speedboat-list-side'),document.getElementById('speedboat-list')]){
    if(node)node.innerHTML='<div class="schedule-empty">Rutetider fra Entur er ikke tilgjengelige akkurat nå.</div>';
   }
  }
 }
}
window.KsuSpeedboatSchedule={toRows,pickKristiansundQuay,render,refresh};
if(typeof document!=='undefined'&&(document.getElementById('speedboat-list-side')||document.getElementById('speedboat-list'))){
 void refresh();
 setInterval(refresh,REFRESH_MS);
 setInterval(()=>{if(lastCalls)render();},60000);
}
})();
