/* Public Politiloggen notices for Kristiansund.
   Privacy-safe: no incident narratives, persons or exact inferred locations. */
(function(){
'use strict';
const URL='https://flyradar-ksu.vidar-skoglund.workers.dev/police';
const REFRESH=5*60*1000;
const list=document.getElementById('police-incidents');
const stamp=document.getElementById('police-update');
let incidents=[],lastGood=0,healthy=false;
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
function recent(){
 const now=Date.now();
 return incidents.filter(i=>validCategory(i.category)&&now-localTime(i.updated_at)<24*3600000&&
  localTime(i.updated_at)<=now+300000);
}
function render(){
 if(!list)return;
 const current=recent();
 list.replaceChildren();
 if(stamp)stamp.textContent=healthy?'Politiloggen · '+clock(new Date().toISOString()):'Ikke oppdatert';
 if(!healthy&&!lastGood){
  const el=document.createElement('div');el.className='police-empty';
  el.textContent='Politiloggen er utilgjengelig akkurat nå';list.append(el);return;
 }
 if(!current.length){
  const el=document.createElement('div');el.className='police-empty';
  el.textContent='Ingen nye offentlige meldinger i Kristiansund';list.append(el);return;
 }
 for(const item of current.slice(0,2)){
  const row=document.createElement('div');row.className='police-row';
  const main=document.createElement('span');main.className='police-row-title';
  main.textContent=categoryName(item.category)+' · '+String(item.area||'Kristiansund').slice(0,45);
  const when=document.createElement('span');when.className='police-row-time';
  when.textContent=clock(item.updated_at);
  row.append(main,when);list.append(row);
 }
 const note=document.createElement('small');note.className='police-note';
 note.textContent='Publiserte meldinger – ikke bekreftet pågående. Omtrentlig plassering.';
 list.append(note);
}
window.KsuPoliceStatus={
 headlines(){
  if(!healthy)return [];
  return recent().filter(item=>Date.now()-localTime(item.updated_at)<3*3600000)
   .slice(0,2).map(item=>({
    level:item.category==='trafikk'?1.8:item.category==='brann'?2.2:3,
    category:'POLITILOGGEN',
    message:categoryName(item.category)+' meldt: '+String(item.area||'Kristiansund').slice(0,45),
    detail:'Politiet · offentlig melding · tidspunkt '+clock(item.updated_at)+
      ' · status og nøyaktig sted ikke bekreftet'
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
