(function(){
'use strict';
const CACHE_KEY='trafikkradar-vessel-wikidata-v1';
const TTL_FOUND=7*86400000,TTL_EMPTY=86400000;
const pending=new Map();
function identifiers(v){
 const imo=String(v?.imo||'').replace(/\D/g,'');
 const mmsi=String(v?.mmsi||'').replace(/\D/g,'');
 return {imo:imo.length===7?imo:'',mmsi:mmsi.length===9?mmsi:''};
}
function cacheGet(key){
 try{
  const item=JSON.parse(localStorage.getItem(CACHE_KEY)||'{}')[key];
  return item&&item.until>Date.now()?{hit:true,value:item.value}:{hit:false};
 }catch{return {hit:false};}
}
function cacheSave(key,value){
 try{
  const now=Date.now(),raw=JSON.parse(localStorage.getItem(CACHE_KEY)||'{}');
  const all=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};
  for(const k of Object.keys(all))if(!all[k]||all[k].until<now)delete all[k];
  all[key]={value,until:now+(value?TTL_FOUND:TTL_EMPTY)};
  localStorage.setItem(CACHE_KEY,JSON.stringify(Object.fromEntries(Object.entries(all).slice(-80))));
 }catch{}
}
function sparql(property,id){
 return 'SELECT ?ship ?imo ?mmsi ?typeLabel ?operatorLabel ?registryLabel ?entry WHERE { '+
  '?ship wdt:'+property+' "'+id+'". '+
  'OPTIONAL { ?ship wdt:P458 ?imo. } '+
  'OPTIONAL { ?ship wdt:P587 ?mmsi. } '+
  'OPTIONAL { ?ship wdt:P31 ?type. } '+
  'OPTIONAL { ?ship wdt:P137 ?operator. } '+
  'OPTIONAL { ?ship wdt:P8047 ?registry. } '+
  'OPTIONAL { ?ship wdt:P729 ?entry. } '+
  'SERVICE wikibase:label { bd:serviceParam wikibase:language "nb,en". } } LIMIT 10';
}
function parseMatches(rows,ids){
 const matches=[];
 for(const row of rows||[]){
  const uri=String(row.ship?.value||'');
  const qid=uri.match(/^https:\/\/www\.wikidata\.org\/entity\/(Q[1-9]\d*)$/)?.[1];
  if(!qid)continue;
  const imo=String(row.imo?.value||'').trim(),mmsi=String(row.mmsi?.value||'').trim();
  if(ids.imo&&imo&&imo!==ids.imo)continue;
  if(ids.mmsi&&mmsi&&mmsi!==ids.mmsi)continue;
  if(ids.imo&&imo!==ids.imo&&ids.mmsi&&mmsi!==ids.mmsi)continue;
  if(ids.imo&&!ids.mmsi&&imo!==ids.imo)continue;
  if(!ids.imo&&ids.mmsi&&mmsi!==ids.mmsi)continue;
  if(!matches.some(x=>x.qid===qid)){
   const text=(field)=>{const v=String(row[field]?.value||'').trim();return v&&!/^Q\d+$/.test(v)?v.slice(0,100):'';};
   const entry=String(row.entry?.value||'');
   const year=/^\d{4}-/.test(entry)?entry.slice(0,4):'';
   matches.push({qid,type:text('typeLabel'),operator:text('operatorLabel'),
     registry:text('registryLabel'),serviceYear:year});
  }
 }
 // A duplicate/conflicting identifier in Wikidata is not enough to pick one ship.
 return matches.length===1?matches[0]:null;
}
async function requestMatch(property,id,ids){
 const q=new URLSearchParams({query:sparql(property,id),format:'json'});
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
 try{
  const response=await fetch('https://query.wikidata.org/sparql?'+q,{
   credentials:'omit',headers:{Accept:'application/sparql-results+json'},
   signal:controller.signal});
  if(!response.ok)throw new Error('HTTP '+response.status);
  const data=await response.json();
  return parseMatches(data?.results?.bindings,ids);
 }finally{clearTimeout(timer);}
}
async function lookup(v){
 const ids=identifiers(v);
 if(!ids.imo&&!ids.mmsi)return {status:'no-id'};
 const key=ids.imo+':'+ids.mmsi;
 const cached=cacheGet(key);
 if(cached.hit)return {status:cached.value?'found':'empty',value:cached.value};
 if(pending.has(key))return pending.get(key);
 const promise=(async()=>{
  try{
   const value=(ids.imo?await requestMatch('P458',ids.imo,ids):null)||
     (ids.mmsi?await requestMatch('P587',ids.mmsi,ids):null);
   cacheSave(key,value);
   return {status:value?'found':'empty',value};
  }catch(e){
   console.warn('Wikidata-oppslag ikke tilgjengelig',e);
   return {status:'unavailable'};
  }finally{pending.delete(key);}
 })();
 pending.set(key,promise);
 return promise;
}
function renderResult(container,result){
 if(!container)return;
 container.replaceChildren();
 const heading=document.createElement('strong');
 heading.textContent='Flere skipsopplysninger · Wikidata';
 container.append(heading);
 if(result.status!=='found'){
  const note=document.createElement('small');
  note.textContent=result.status==='unavailable'?'Wikidata er ikke tilgjengelig akkurat nå':
   result.status==='no-id'?'Kan ikke slå opp skip uten gyldig IMO eller MMSI':
   'Ingen sikkert identifisert Wikidata-post funnet';
  container.append(note);
  return;
 }
 const data=result.value;
 const fields=[['Skipstype',data.type],['Operatør',data.operator],
   ['Registreringsland',data.registry],['Tatt i bruk (år)',data.serviceYear]];
 const list=document.createElement('div');list.className='vessel-wikidata-fields';
 for(const [name,value] of fields){
  if(!value)continue;
  const entry=document.createElement('span');
  entry.textContent=name+': '+value;list.append(entry);
 }
 if(!list.childNodes.length){
  const note=document.createElement('small');note.textContent='Ingen ekstra felt registrert';container.append(note);
 }else container.append(list);
 const source=document.createElement('a');
 source.href='https://www.wikidata.org/wiki/'+data.qid;
 source.target='_blank';source.rel='noopener noreferrer';
 source.textContent='Åpne Wikidata-kilden';
 container.append(source);
 const disclaimer=document.createElement('small');
 disclaimer.textContent='Wikidata kan være ufullstendig eller utdatert. Posisjon, fart og kurs kommer fortsatt fra AIS/Kystverket.';
 container.append(disclaimer);
}
window.loadSelectedVesselFacts=async function(v,identity){
 const parent=document.getElementById('type-info');
 const container=parent?.querySelector('#vessel-wikidata');
 if(!container)return;
 const result=await lookup(v);
 if(document.getElementById('type-info')?.dataset.photoIdentity!==identity)return;
 renderResult(document.getElementById('vessel-wikidata'),result);
};
})();
