const KEY='flyradar-ksu-admin-log-v1';
const $=id=>document.getElementById(id);
function records(){try{const x=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(x)?x:[]}catch{return []}}
function escapeHtml(x){return String(x??'–').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function card(label,value,detail,cls=''){return '<div class="card"><small>'+escapeHtml(label)+'</small><strong class="'+cls+'">'+escapeHtml(value)+'</strong><small>'+escapeHtml(detail)+'</small></div>'}
function fmtDate(s){if(!s)return '–';const d=new Date(s);return Number.isNaN(d.getTime())?'–':d.toLocaleString('no-NO')}
function render(){
 const all=records(),rows=all.filter(r=>r.event==='flydata'),last=rows.at(-1);
 $('stamp').textContent='Vist '+new Date().toLocaleTimeString('no-NO');
 const sources=[['Worker','worker'],['adsb.lol','adsbLol'],['adsb.fi','adsbFi'],['Airplanes.live','airplanesLive']];
 $('sources').innerHTML=sources.map(([name,key])=>{
   const v=last?.[key]||'Ukjent';
   const good=rows.filter(r=>r[key]==='OK').length;
   const seen=rows.filter(r=>r[key]==='OK'||r[key]==='feil').length;
   const lastOk=[...rows].reverse().find(r=>r[key]==='OK');
   return card(name,v,'Vellykket '+good+'/'+seen+' registrerte oppslag · Sist OK: '+fmtDate(lastOk?.at),v==='OK'?'ok':v==='feil'?'bad':'warn');
 }).join('');
 const first=rows[0],changes=rows.filter((r,i)=>i===0||sources.some(([,k])=>r[k]!==rows[i-1]?.[k]));
 const success=rows.filter(r=>r.worker==='OK').length;
 $('metrics').innerHTML=[
   card('Registrerte oppslag',rows.length,'Siden '+fmtDate(first?.at)),
   card('Worker-tilgjengelighet',rows.length?Math.round(success/rows.length*100)+' %':'–','Basert på denne nettleseren'),
   card('Siste antall fly',last?.aircraft??'–','Antall før filtrering i kartet'),
   card('Statusendringer',changes.length,'Registrerte overganger i datakildene')
 ].join('');
 const err=last?.fiDirectError;
 $('diagnosis').innerHTML=last
  ? '<p><b>Siste kildevalg:</b> '+escapeHtml(last.source)+' · <b>Siste oppslag:</b> '+fmtDate(last.at)+'</p><p><b>Direkte adsb.fi-feil:</b> '+escapeHtml(err||'Ingen registrert (ikke nødvendigvis testet)')+'</p><p><b>Neste tillatte direkte forsøk:</b> '+fmtDate(last.fiRetryAt)+'</p><p>HTTP 403 tyder på avvist tilgang; «Failed to fetch» kan skyldes CORS, nettverk eller blokkering. Vi kan ikke skille disse uten nettverkslogger.</p>'
  : '<p>Ingen målinger ennå. Åpne flykartet i denne nettleseren, vent på oppdatering og gå tilbake hit.</p>';
 let filtered=rows;
 if($('filter').value==='changes')filtered=changes;
 filtered=filtered.slice(-Number($('limit').value)).reverse();
 $('history').innerHTML=filtered.map(r=>'<tr><td>'+fmtDate(r.at)+'</td><td>'+escapeHtml(r.worker)+'</td><td>'+escapeHtml(r.adsbLol)+'</td><td>'+escapeHtml(r.adsbFi)+'</td><td>'+escapeHtml(r.airplanesLive)+'</td><td>'+escapeHtml(r.aircraft)+'</td><td>'+escapeHtml(r.fiDirectError||r.source)+'</td></tr>').join('')||'<tr><td colspan="7">Ingen registrerte oppslag</td></tr>';
}
function download(name,type,data){const blob=new Blob([data],{type});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
$('refresh').onclick=render;$('filter').onchange=render;$('limit').onchange=render;
$('json').onclick=()=>download('flyradar-ksu-status.json','application/json',JSON.stringify(records(),null,2));
$('csv').onclick=()=>{const rows=records();const keys=['at','event','worker','adsbLol','adsbFi','airplanesLive','aircraft','source','fiDirectError','fiRetryAt'];const quote=x=>'"'+String(x??'').replace(/"/g,'""')+'"';download('flyradar-ksu-status.csv','text/csv;charset=utf-8','\uFEFF'+[keys.join(';'),...rows.map(r=>keys.map(k=>quote(r[k])).join(';'))].join('\r\n'))};
$('clear').onclick=()=>{if(confirm('Slette all lokal statushistorikk for denne nettleseren?')){localStorage.removeItem(KEY);render()}};
render();setInterval(render,30000);

const WORKER_TEST_URL='https://flyradar-ksu.vidar-skoglund.workers.dev/aircraft';
const FI_TEST_URL='https://opendata.adsb.fi/api/v3/lat/63.1118/lon/7.8245/dist/75';
const TEST_HISTORY_KEY='flyradar-ksu-api-tests-v1';
async function probe(url,name){
 const start=performance.now(),controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),10000);
 try{
   const response=await fetch(url,{cache:'no-store',credentials:'omit',signal:controller.signal});
   const ms=Math.round(performance.now()-start);
   let data=null;
   try{data=await response.json()}catch{}
   const sourceSummary=name==='Worker'&&data?.sources
     ? Object.entries(data.sources).map(([key,v])=>key+': '+(v?.ok?'OK':'feil')+(v?.status?' HTTP '+v.status:'')+(v?.error?' '+String(v.error).slice(0,120):'')).join(' | ')
     : data&&Array.isArray(data.ac||data.aircraft)?'Fly: '+(data.ac||data.aircraft).length:'Ingen gyldig flyliste bekreftet';
   return {at:new Date().toISOString(),name,status:response.status,ms,ok:response.ok,detail:sourceSummary};
 }catch(e){
   return {at:new Date().toISOString(),name,status:null,ms:Math.round(performance.now()-start),ok:false,detail:(e?.name==='AbortError'?'Tidsavbrudd':String(e?.message||e))+' (kan skyldes CORS/nettverk; HTTP-status utilgjengelig)'};
 }finally{clearTimeout(timeout)}
}
function renderProbeResults(results){
 $('test-results').innerHTML=results.map(r=>'<tr><td>'+escapeHtml(r.name)+'</td><td class="'+(r.ok?'ok':'bad')+'">'+(r.ok?'OK':'Feil')+'</td><td>'+escapeHtml(r.status??'Ikke tilgjengelig')+'</td><td>'+escapeHtml(r.ms)+' ms</td><td>'+escapeHtml(r.detail)+'</td></tr>').join('');
}
try{const prior=JSON.parse(localStorage.getItem(TEST_HISTORY_KEY)||'[]');if(prior.length){const latest=prior.slice(-2);renderProbeResults(latest);$('test-state').textContent='Siste test: '+fmtDate(latest.at(-1)?.at)}}catch{}
$('test-api').onclick=async()=>{
 const button=$('test-api');button.disabled=true;$('test-state').textContent='Tester…';
 try{
   // One manual direct request, not an automatic polling loop.
   const results=await Promise.all([probe(WORKER_TEST_URL,'Worker'),probe(FI_TEST_URL,'adsb.fi direkte')]);
   renderProbeResults(results);
   try{const old=JSON.parse(localStorage.getItem(TEST_HISTORY_KEY)||'[]');localStorage.setItem(TEST_HISTORY_KEY,JSON.stringify([...old,...results].slice(-200)))}catch{}
   $('test-state').textContent='Testet '+fmtDate(results[0].at);
 }finally{button.disabled=false}
};

function renderRoutePilot25Stats(){
 let row={};
 try{row=JSON.parse(localStorage.getItem('trafikkradar-route25-free-pilot-v1')||'{}')||{}}catch(e){}
 const today=new Date().toISOString().slice(0,10);
 if(row.day!==today)row={attempts:0,found:0,noRoute:0,errors:0,paidCalls:0,estimatedUsd:0};
 const set=(id,value)=>{const el=$(id);if(el)el.textContent=String(value)};
 set('route25-attempts',row.attempts||0);
 set('route25-found',row.found||0);
 set('route25-unresolved',`${row.noRoute||0} / ${row.errors||0}`);
 set('route25-paid',row.paidCalls||0);
 set('route25-cost','USD '+Number(row.estimatedUsd||0).toFixed(2).replace('.',','));
}
renderRoutePilot25Stats();
window.addEventListener('storage',event=>{
 if(event.key==='trafikkradar-route25-free-pilot-v1')renderRoutePilot25Stats();
});
