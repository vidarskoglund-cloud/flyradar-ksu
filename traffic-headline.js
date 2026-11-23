/* Fixed-height, non-scrolling live headlines. Only observed/qualified events. */
(function(){
'use strict';
const banner=document.getElementById('traffic-headline');
const tag=document.getElementById('traffic-headline-tag');
const title=document.getElementById('traffic-headline-title');
const note=document.getElementById('traffic-headline-note');
if(!banner||!tag||!title||!note)return;
const fallback={category:'OVERSIKT',message:'Trafikkbildet oppdateres automatisk',detail:'Fly, fartøy og registrerte veihendelser fra tilgjengelige kilder'};
let activeKey='',shownSince=0;
function short(value,length){return String(value||'').replace(/\s+/g,' ').trim().slice(0,length);}
function roadHeadlines(){
 const snapshot=window.KsuRoadStatus?.getCurrentSnapshot?.();
 if(!snapshot)return [];
 const now=Date.now(),all=[...Object.values(snapshot.roads||{}).flat(),...(snapshot.local||[])],seen=new Set(),out=[];
 for(const e of all){
  const place=short(e?.place,95),message=short(e?.message,120);
  if(!place||!message)continue;
  const start=Date.parse(e.start||''),end=Date.parse(e.end||'');
  if(Number.isFinite(end)&&end<now)continue;
  const planned=Number.isFinite(start)&&start>now;
  if(planned&&start-now>24*3600000)continue;
  const category=/stengt|stengning|closed/i.test(message)?'VEITRAFIKK':/veg(?:-|\s*)arbeid|veiarbeid|maintenanceworks/i.test(message+' '+e.type)?'VEGARBEID':'TRAFIKKMELDING';
  const placeName=place.replace(/^(?:[RF]v\.?\s*\d+|E\s*\d+)\s+/i,'').split(/\s+i Kristiansund|\s+-\s+/i)[0].slice(0,50);
  const key=placeName.toLowerCase()+'|'+category;
  if(seen.has(key))continue;seen.add(key);
  out.push({level:category==='VEITRAFIKK'&&!planned?1:planned?5:3,
   category:planned?'PLANLAGT':category,
   message:(planned?'Planlagt: ':'Registrert: ')+placeName,
   detail:planned?'Vegvesenet · starter innen 24 timer · tid fra DATEX':
     'Vegvesenet DATEX · registrert hendelse, aktuell status ikke bekreftet'});
 }
 return out.slice(0,3);
}
function collect(){
 const live=typeof window.KsuHeadlineData==='function'?window.KsuHeadlineData():[];
 const police=window.KsuPoliceStatus?.headlines?.()||[];
 const items=[...roadHeadlines(),...police,...(Array.isArray(live)?live:[])];
 return items.length?items.sort((a,b)=>a.level-b.level):[fallback];
}
function show(x){
 const key=x.category+'|'+x.message;
 if(key===activeKey)return;
 activeKey=key;
 banner.dataset.kind=x.category;
 tag.textContent=short(x.category,22);
 title.textContent=short(x.message,92);
 note.textContent=short(x.detail,115);
}
function cycle(){
 const items=collect();
 const now=Date.now();
 // Display each message for 12 seconds, without shifting other elements.
 const index=Math.floor(now/12000)%items.length;
 show(items[index]);
 shownSince=now;
}
cycle();
setInterval(cycle,3000);
})();
