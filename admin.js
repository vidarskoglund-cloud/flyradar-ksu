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
