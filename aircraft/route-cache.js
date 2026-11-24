// Browser-local confirmed flight routes. Loaded before app.js.
// Initialization remains in app.js because routeText() is declared there.
const routeCache=new Map();
const routeAttempts=new Map();
const routeRequests=new Set();
const aircraftRouteCache=new Map();
const ROUTE_STORAGE_KEY='flyradar-ksu-confirmed-routes-v1';
const ROUTE_TTL_MS=24*60*60*1000;
const ROUTE_MAX_ENTRIES=250;
function routeDay(now=Date.now()){return new Date(now).toISOString().slice(0,10);}
function flightRouteKey(p,now=Date.now()){
  const flight=String(p?.flight||'').trim().toUpperCase();
  return flight?routeDay(now)+'|'+flight:'';
}
function loadSavedRoutes(){
  try{
    const stored=JSON.parse(localStorage.getItem(ROUTE_STORAGE_KEY)||'[]');
    if(!Array.isArray(stored))return;
    const now=Date.now();
    for(const item of stored){
      if(!item||typeof item.key!=='string'||!item.route||typeof item.route!=='object'||routeText(item.route)==='Rute ikke tilgjengelig')continue;
      if(!Number.isFinite(item.savedAt)||item.savedAt>now||now-item.savedAt>ROUTE_TTL_MS)continue;
      if(!item.key.startsWith(routeDay(now)+'|'))continue;
      routeCache.set(item.key,item.route);
      aircraftRouteCache.set(item.key,item.route);
    }
  }catch(e){console.warn('Kunne ikke lese lagrede flyruter:',e);}
}
function saveConfirmedRoute(p,route){
  if(!route||typeof route!=='object'||routeText(route)==='Rute ikke tilgjengelig')return;
  const key=flightRouteKey(p);
  if(!key)return;
  routeCache.set(key,route);
  aircraftRouteCache.set(key,route);
  try{
    const now=Date.now();
    const saved=JSON.parse(localStorage.getItem(ROUTE_STORAGE_KEY)||'[]');
    const entries=Array.isArray(saved)?saved.filter(item=>
      item&&item.key!==key&&item.route&&Number.isFinite(item.savedAt)&&
      item.savedAt<=now&&now-item.savedAt<ROUTE_TTL_MS&&
      item.key.startsWith(routeDay(now)+'|')):[];
    entries.push({key,route,savedAt:now});
    localStorage.setItem(ROUTE_STORAGE_KEY,JSON.stringify(entries.slice(-ROUTE_MAX_ENTRIES)));
  }catch(e){console.warn('Kunne ikke lagre bekreftet flyrute:',e);}
}
