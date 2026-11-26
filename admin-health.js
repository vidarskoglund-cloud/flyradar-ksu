/* Read-only service snapshot for public admin. No credentials, uploads or private data. */
(function(){
 'use strict';
 const worker='https://flyradar-ksu.vidar-skoglund.workers.dev';
 const defs=[
  {id:'pages',title:'GitHub Pages',url:new URL('./manifest.webmanifest?health=1',location.href).toString(),
   check:async r=>{const data=await r.json();return data&&data.name==='Kristiansund Trafikkradar'?{detail:'Nettsidefil og oppdatert manifest tilgjengelig'}:null;}},
  {id:'worker',title:'Cloudflare Worker',url:worker+'/health',
   check:async r=>{const data=await r.json();return data?.ok===true?{detail:'Worker svarer på /health (ikke datakildetest)'}:null;}},
  {id:'planes',title:'Flydata',url:worker+'/aircraft',
   check:async r=>{const data=await r.json();
    if(data?.ok===false)return null;
    const list=Array.isArray(data?.ac)?data.ac:Array.isArray(data?.aircraft)?data.aircraft:null;
    return list?{detail:'Flyendepunkt svarer · '+list.length+' registrerte fly (0 kan være normalt)'}:null;
   }},
  {id:'ais',title:'AIS',url:worker+'/vessels',
   check:async r=>{const data=await r.json();return data?.ok===true&&Array.isArray(data?.vessels)?
    {detail:'AIS-endepunkt svarer · '+data.vessels.length+' fartøy i resultatet'}:null;}}
 ];
 const get=id=>document.getElementById(id);
 const set=(id,value,detail,state)=>{
  const heading=get('live-'+id),sub=get('live-'+id+'-detail');
  if(!heading||!sub)return;
  heading.textContent=value;heading.className=state||'';
  sub.textContent=detail;
 };
 async function checkOne(def){
  set(def.id,'Kontrollerer…','Sender én forespørsel', 'warn');
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),14000);
  try{
   const response=await fetch(def.url,{cache:'no-store',credentials:'omit',signal:controller.signal});
   if(!response.ok){set(def.id,'Feil / utilgjengelig','HTTP '+response.status,'bad');return;}
   const parsed=await def.check(response);
   if(!parsed){set(def.id,'Uavklart','Svar mottatt, men innholdet kunne ikke bekreftes','warn');return;}
   set(def.id,'Svar OK',parsed.detail,'ok');
  }catch(error){
   const msg=error?.name==='AbortError'?'Tidsavbrudd':String(error?.message||error).slice(0,100);
   set(def.id,'Ikke bekreftet',msg+' · kan skyldes nettleser/CORS','warn');
  }finally{clearTimeout(timer);}
 }
 let working=false;
 async function checkAll(){
  if(working)return;
  working=true;const btn=get('check-services');btn.disabled=true;
  get('service-stamp').textContent='Kontrollerer tjenester fra denne nettleseren…';
  try{
   await Promise.all(defs.map(checkOne));
   get('service-stamp').textContent='Sist kontrollert '+new Date().toLocaleString('nb-NO')+' · ingen automatisk overvåking';
  }finally{working=false;btn.disabled=false;}
 }
 get('check-services')?.addEventListener('click',checkAll);
 checkAll();
})();
