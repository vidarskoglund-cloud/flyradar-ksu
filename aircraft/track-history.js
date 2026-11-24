// Browser-local aircraft track history. Keep load order before app.js.
const trackHistory=new Map();
const TRACK_STORE_KEY='flyradar-ksu-trails-v1';
const TRACK_KEEP_MS=30*60*1000;
const TRACK_MAX_POINTS=140;
function validTrackPoint(p,cutoff,now){
 const lat=Number(p?.lat),lon=Number(p?.lon),t=Number(p?.t);
 return Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180&&Number.isFinite(t)&&t>=cutoff&&t<=now+10000;
}
function restoreTrackHistory(){
 try{
  const now=Date.now(),cutoff=now-TRACK_KEEP_MS;
  const saved=JSON.parse(localStorage.getItem(TRACK_STORE_KEY)||'[]');
  if(!Array.isArray(saved))return;
  for(const x of saved.slice(0,70)){
   if(!x||!/^[a-z0-9-]{1,35}$/.test(x.key)||!Array.isArray(x.points))continue;
   const points=x.points.filter(p=>validTrackPoint(p,cutoff,now)).slice(-TRACK_MAX_POINTS);
   if(points.length)trackHistory.set(x.key,points);
  }
 }catch(e){console.warn('Kunne ikke lese flyspor',e);}
}
function persistTrackHistory(){
 try{
  const now=Date.now(),cutoff=now-TRACK_KEEP_MS;
  const saved=[...trackHistory].map(([key,points])=>({key,points:points.filter(p=>validTrackPoint(p,cutoff,now)).slice(-TRACK_MAX_POINTS)}))
   .filter(x=>x.points.length&&/^[a-z0-9-]{1,35}$/.test(x.key))
   .sort((x,y)=>y.points.at(-1).t-x.points.at(-1).t).slice(0,70);
  localStorage.setItem(TRACK_STORE_KEY,JSON.stringify(saved));
 }catch(e){console.warn('Kunne ikke lagre flyspor',e);}
}
restoreTrackHistory();
