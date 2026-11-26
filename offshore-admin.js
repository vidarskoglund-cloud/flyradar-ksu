/* Read-only display of local offshore helicopter coverage captured on the main page. */
(function(){
'use strict';
const KEY='trafikkradar-offshore-trips-v1';
const $=id=>document.getElementById(id);
function read(){
 try{const v=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(v)?v:[];}
 catch{return []}
}
function txt(x){return String(x??'–')}
function cell(row,value){const td=document.createElement('td');td.textContent=txt(value);row.append(td);}
function render(){
 const data=read().slice(-40).reverse();
 const table=$('offshore-rows');table.replaceChildren();
 for(const trip of data){
  const row=document.createElement('tr');
  cell(row,(trip.reg||'Ukjent')+' · '+trip.hex);
  cell(row,(trip.callsigns||[]).join(' → ')||'Ikke oppgitt');
  cell(row,Number.isFinite(Number(trip.maxNm))?Number(trip.maxNm).toFixed(1)+' NM':'–');
  const gaps=Array.isArray(trip.gaps)?trip.gaps:[];
  cell(row,gaps.length+' registrerte brudd'+(gaps.length?' · '+gaps.map(g=>g.minutes+' min').join(', '):''));
  cell(row,trip.status||'Ukjent');
  table.append(row);
 }
 if(!data.length){const row=document.createElement('tr');const td=document.createElement('td');td.colSpan=5;td.textContent='Ingen turer registrert på denne enheten ennå.';row.append(td);table.append(row);}
 $('offshore-status').textContent=data.length+' turer i lokal historikk · sist vist '+new Date().toLocaleTimeString('nb-NO')+'. Nettleseren må ha hovedsiden åpen for nye observasjoner.';
}
function exportJson(){
 const data=JSON.stringify({format:'trafikkradar-offshore-coverage-v1',exportedAt:new Date().toISOString(),trips:read()},null,2);
 const url=URL.createObjectURL(new Blob([data],{type:'application/json'}));
 const a=document.createElement('a');a.href=url;a.download='trafikkradar-offshorehistorikk.json';a.click();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
}
$('offshore-refresh')?.addEventListener('click',render);
$('offshore-export')?.addEventListener('click',exportJson);
window.addEventListener('storage',e=>{if(e.key===KEY)render();});
render();
})();
