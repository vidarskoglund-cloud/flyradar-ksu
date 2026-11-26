/* Public Politiloggen notices for Kristiansund.
   Privacy-safe: no incident narratives, persons or exact inferred locations. */
(function(){
'use strict';
const URL='https://flyradar-ksu.vidar-skoglund.workers.dev/police';
const REFRESH=5*60*1000;
const POLICE_UI_VERSION='6';
const list=document.getElementById('police-incidents');
const stamp=document.getElementById('police-update');
let incidents=[],lastGood=0,healthy=false;
function isTrafficControl(i){return /trafikk?kontroll|fartskontroll|hastighetskontroll/i.test(String(i.label||''));}
function eventLabel(i){return String(i.label||categoryName(i.category)).slice(0,44);}
function maxAge(i){return isTrafficControl(i)?30*60000:i.active?6*3600000:3*3600000;}
function policeUrl(i){
 const id=String(i.id||'');
 return /^[a-zA-Z0-9_-]{4,70}$/.test(id)?'https://www.politiet.no/politiloggen/hendelse/'+encodeURIComponent(id):'';
}
function clock(value){
 const t=Date.parse(value||'');
 return Number.isFinite(t)?new Intl.DateTimeFormat('nb-NO',
  {hour:'2-digit',minute:'2-digit',timeZone:'Europe/Oslo'}).format(t):'';
}
function validCategory(kind){return ['trafikk','brann','redning'].includes(kind);}
function categoryName(kind){
 return kind==='brann'?'Brann':kind==='trafikk'?'Trafikk':'Redning';
}
function localTime(value){const t=Date.parse(value||'');return Number.isFinite(t)?t:0;}
// Compare the displayed Oslo clock as an independent safety guard too.
// Some source timestamps can be updated independently of the incident time;
// a traffic-control notice must not remain visible when its displayed time
// is already several hours old. Avoid inventing a precise incident location.
function osloClockMinutes(value){
 const parsed=Date.parse(value||'');
 if(!Number.isFinite(parsed))return null;
 const parts=new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit',
   hourCycle:'h23',timeZone:'Europe/Oslo'}).formatToParts(parsed);
 const hour=Number(parts.find(p=>p.type==='hour')?.value);
 const minute=Number(parts.find(p=>p.type==='minute')?.value);
 return Number.isFinite(hour)&&Number.isFinite(minute)?hour*60+minute:null;
}
function trafficControlAgeOk(i,now){
 if(!isTrafficControl(i))return true;
 const event=osloClockMinutes(i.updated_at);
 const clockNow=osloClockMinutes(new Date(now).toISOString());
 if(event===null||clockNow===null)return false;
 // Local clock rollover is allowed, but the older timestamp guard still
 // rejects events from prior days at the same clock time.
 return ((clockNow-event+1440)%1440)<30;
}
function recent(){
 const now=Date.now();
 return incidents.filter(i=>validCategory(i.category)&&
  now-localTime(i.updated_at)>=0&&now-localTime(i.updated_at)<maxAge(i)&&
  localTime(i.updated_at)<=now+300000&&trafficControlAgeOk(i,now));
}
function render(){
 if(!list)return;
 const current=recent();
 list.replaceChildren();
 if(stamp)stamp.textContent=healthy?'Politiloggen v'+POLICE_UI_VERSION+' · '+clock(new Date().toISOString()):'Ikke oppdatert';
 if(!healthy){
  const el=document.createElement('div');el.className='police-empty';
  el.textContent='Politiloggen er utilgjengelig akkurat nå';list.append(el);return;
 }
 if(!current.length){
  const el=document.createElement('div');el.className='police-empty';
  el.textContent='Ingen nye politimeldinger i området';list.append(el);return;
 }
 for(const item of current.slice(0,2)){
  const row=document.createElement('div');row.className='police-row';
  const main=document.createElement('span');main.className='police-row-title';
  const area=String(item.area||'Kristiansund').slice(0,45);
  const link=policeUrl(item);
  const content=eventLabel(item)+' · '+area;
  if(link){
   const anchor=document.createElement('a');
   anchor.href=link;anchor.target='_blank';anchor.rel='noopener noreferrer';
   anchor.textContent=content;
   main.append(anchor);
  }else main.textContent=content;
  const when=document.createElement('span');when.className='police-row-time';
  when.textContent=clock(item.updated_at);
  row.append(main,when);list.append(row);
 }
 const note=document.createElement('small');note.className='police-note';
 note.textContent='Kilde: Politiloggen · ikke nødvendigvis pågående · område, ikke eksakt sted.';
 list.append(note);
}
window.KsuPoliceStatus={
 headlines(){
  if(!healthy)return [];
  return recent().filter(item=>!isTrafficControl(item)&&
     Date.now()-localTime(item.updated_at)<(item.active?2*3600000:30*60000))
   .slice(0,2).map(item=>({
    level:item.category==='trafikk'?1.8:item.category==='brann'?2.2:3,
    category:'POLITILOGGEN',
    message:eventLabel(item)+' · '+String(item.area||'Kristiansund').slice(0,45),
    detail:'Politiloggen '+clock(item.updated_at)+
      ' · kun område oppgitt · se meldingen hos politiet'
   }));
 }
};
async function refresh(){
 try{
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),18000);
  let response;
  try{response=await fetch(URL,{cache:'no-store',credentials:'omit',signal:controller.signal});}
  finally{clearTimeout(timer);}
  if(!response.ok)throw Error('HTTP '+response.status);
  const json=await response.json();
  if(!json.ok||!Array.isArray(json.incidents))throw Error('Uventet API-svar');
  incidents=json.incidents.filter(i=>i&&validCategory(i.category)&&
   typeof i.updated_at==='string'&&typeof i.area==='string').slice(0,10);
  healthy=true;lastGood=Date.now();
  window.KsuPoliceMap?.update(incidents);
 }catch(error){
  healthy=false;
  console.warn('Politiloggen kan ikke oppdateres:',error);
  // No stale pins when upstream is unavailable.
  window.KsuPoliceMap?.update([]);
 }
 render();
}
render();void refresh();
setInterval(refresh,REFRESH);
setInterval(render,60000);
})();
