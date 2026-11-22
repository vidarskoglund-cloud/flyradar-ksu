(function(){
'use strict';
// The airport section is a measured METAR report, never a city forecast.
// No measured airport value is displayed if the observation is older than 2h.
const URL='https://flyradar-ksu.vidar-skoglund.workers.dev/weather';
const POLL_MS=10*60*1000;
function format(value,unit,digits=0){
 const n=Number(value);
 return value===null||value===undefined||!Number.isFinite(n)?'–':n.toFixed(digits)+unit;
}
function timeLabel(time){
 const timestamp=Date.parse(time||'');
 return Number.isFinite(timestamp)?new Date(timestamp).toLocaleTimeString('no-NO',{hour:'2-digit',minute:'2-digit'}):'ukjent';
}
function observedFresh(obs,now=Date.now()){
 const t=Date.parse(obs?.observed_at||'');
 return Number.isFinite(t)&&t<=now+5*60*1000&&now-t<=2*60*60*1000;
}
function item(name,value){
 const div=document.createElement('div');
 const label=document.createElement('span');label.textContent=name+' ';
 const strong=document.createElement('b');strong.textContent=value;
 div.append(label,strong);return div;
}
function block(title,rows,note,link){
 const section=document.createElement('div');section.className='weather-block';
 const heading=document.createElement('strong');heading.textContent=title;section.append(heading);
 const metrics=document.createElement('div');metrics.className='weather-metrics';
 rows.forEach(row=>metrics.append(item(row[0],row[1])));
 section.append(metrics);
 const small=document.createElement('div');small.className='weather-note';small.textContent=note;
 if(link){
  const a=document.createElement('a');a.href=link.url;a.rel='noopener noreferrer';a.target='_blank';
  a.textContent=link.label;small.append(' · ',a);
 }
 section.append(small);return section;
}
function paint(data){
 for(const id of ['weather-side','weather-regular']){
  const root=document.getElementById(id);if(!root)continue;
  root.replaceChildren();
  const observation=data?.observation;
  if(observedFresh(observation)){
   root.append(block('Målt på Kvernberget · ENKB',[
    ['Temperatur',format(observation.temperature_c,' °C',1)],
    ['Vind',format(observation.wind_mps,' m/s',1)],
    ['Vindkast',format(observation.gust_mps,' m/s',1)],
    ['Vindretning',format(observation.wind_direction_deg,'°')],
    ['Sikt',format(observation.visibility_m,' m')],
    ['Lufttrykk',format(observation.pressure_hpa,' hPa')]
   ],'METAR kl. '+timeLabel(observation.observed_at)+' · Aviation Weather Center',
   {url:'https://aviationweather.gov/',label:'Kilde'}));
  }else{
   root.append(block('Målinger · Kvernberget',[], 'Ingen fersk METAR (maks 2 timer) · målinger ikke tilgjengelige'));
  }
  const forecast=data?.forecast;
  const valid=Date.parse(forecast?.valid_at||'');
  if(forecast&&Number.isFinite(valid)&&Math.abs(Date.now()-valid)<=3*60*60*1000){
   root.append(block('Prognose · Kristiansund sentrum',[
    ['Temperatur',format(forecast.temperature_c,' °C',1)],
    ['Vind',format(forecast.wind_mps,' m/s',1)],
    ['Vindkast',format(forecast.gust_mps,' m/s',1)],
    ['Nedbør neste time',format(forecast.precipitation_next_hour_mm,' mm',1)]
   ],'Modellberegnet for kl. '+timeLabel(forecast.valid_at)+' · MET Norway',
   {url:'https://www.yr.no/',label:'Yr'}));
  }else{
   root.append(block('Prognose · Kristiansund sentrum',[], 'Værprognose er ikke tilgjengelig akkurat nå'));
  }
 }
}
async function update(){
 try{
  const response=await fetch(URL,{credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new Error('HTTP '+response.status);
  const data=await response.json();
  if(!data||typeof data!=='object')throw new Error('Invalid weather');
  paint(data);
 }catch(error){
  // The Worker route may not yet be deployed. Never invent current readings.
  paint(null);
 }
}
window.KsuWeather={paint,observedFresh,update};
update();
setInterval(update,POLL_MS);
})();
