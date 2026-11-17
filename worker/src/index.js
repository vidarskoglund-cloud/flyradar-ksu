// Flyradar KSU - clean rebuild. Existing Durable Object binding and deployment retained.
import { DurableObject } from "cloudflare:workers";
const KSU={lat:63.1118,lon:7.8245,radiusNm:75};
const TTL=60000, STALE_MAX=20*60000;
const SOURCES=[
 {name:"adsb.lol",url:"https://api.adsb.lol/v2/point/63.1118/7.8245/75"},
 {name:"airplanes.live",url:"https://api.airplanes.live/v2/point/63.1118/7.8245/75"},
 {name:"adsb.fi",url:"https://opendata.adsb.fi/api/v3/lat/63.1118/lon/7.8245/dist/75"}
];
const headers={"Content-Type":"application/json; charset=utf-8","Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET, OPTIONS","Cache-Control":"no-store"};
function json(body,status=200){return new Response(JSON.stringify(body),{status,headers});}
function retryDelay(response,status){const raw=response.headers.get("Retry-After");let delay=0;if(raw){const seconds=Number(raw);delay=Number.isFinite(seconds)?seconds*1000:Date.parse(raw)-Date.now();}return Math.max(60000,Math.min(3600000,Number.isFinite(delay)&&delay>0?delay:(status===429?300000:900000)));}
function normalize(rows){return rows.filter(a=>Number.isFinite(Number(a.lat))&&Number.isFinite(Number(a.lon))).map(a=>({...a,lat:Number(a.lat),lon:Number(a.lon)}));}
export class TrackStore extends DurableObject {
 constructor(ctx,env){super(ctx,env);this.pending=null;}
 async fetch(request){
  const url=new URL(request.url);
  if(url.pathname!=="/snapshot")return json({error:"Not found"},404);
  const now=Date.now(), state=await this.ctx.storage.get("state")||{sources:{},lastGood:null,nextFetch:0};
  if(now<state.nextFetch)return json(this.present(state,now,"cache"));
  if(!this.pending)this.pending=this.refresh(state).finally(()=>{this.pending=null;});
  return json(this.present(await this.pending,Date.now(),"refresh"));
 }
 present(state,now,cache){
  const fresh=state.lastGood&&now-state.lastGood.time<=STALE_MAX;
  const age=fresh?now-state.lastGood.time:null;
  const live=Boolean(fresh&&age<=TTL&&state.lastSuccess===state.lastGood.time);
  return {ok:live,stale:Boolean(fresh&&!live),generated_at:state.lastGood?new Date(state.lastGood.time).toISOString():null,age_seconds:age===null?null:Math.round(age/1000),center:KSU,count:fresh?state.lastGood.ac.length:0,ac:fresh?state.lastGood.ac:[],sources:state.sources,cache};
 }
 async refresh(state){
  const now=Date.now(),sources={...state.sources},successful=[];
  // Try one provider at a time, avoiding unnecessary calls to blocked providers.
  for(const provider of SOURCES){
   const prior=sources[provider.name]||{};
   if(now<(prior.retryAt||0))continue;
   try{
    const response=await fetch(provider.url,{headers:{"Accept":"application/json"}});
    if(!response.ok){
     sources[provider.name]={ok:false,status:response.status,retryAt:now+retryDelay(response,response.status)};
     continue;
    }
    const payload=await response.json();
    const ac=normalize(Array.isArray(payload.ac)?payload.ac:Array.isArray(payload.aircraft)?payload.aircraft:[]);
    sources[provider.name]={ok:true,status:200,retryAt:0,count:ac.length};
    successful.push(...ac);
    break;
   }catch(error){sources[provider.name]={ok:false,status:0,retryAt:now+120000,error:String(error).slice(0,120)};}
  }
  const unique=new Map();for(const a of successful){const key=String(a.hex||a.r||a.flight||"").trim().toLowerCase();if(key)unique.set(key,a);}
  const updated={...state,sources,nextFetch:now+TTL};
  if(successful.length||Object.values(sources).some(s=>s.ok&&s.retryAt===0)&&unique.size===0){
   updated.lastGood={time:now,ac:[...unique.values()]};updated.lastSuccess=now;
  }else{updated.lastSuccess=null;}
  await this.ctx.storage.put("state",updated);
  return updated;
 }
}
export default {
 async fetch(request,env){
  const url=new URL(request.url);
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers});
  if(request.method!=="GET")return json({error:"Method not allowed"},405);
  if(url.pathname==="/health")return json({ok:true,service:"flyradar-ksu",version:"rebuild-v1"});
  if(url.pathname!=="/"&&url.pathname!=="/aircraft")return json({error:"Not found"},404);
  const id=env.TRACK_STORE.idFromName("ksu-rebuild-v1");
  const response=await env.TRACK_STORE.get(id).fetch("https://internal/snapshot");
  return new Response(response.body,{status:response.status,headers});
 },
 async scheduled(controller,env,ctx){/* Alerts disabled until fresh-data notification logic is validated. */}
};
