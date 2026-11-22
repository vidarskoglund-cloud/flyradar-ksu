/* Road conditions – public source links until DATEX credentials are available.
 * Do not infer a road is open from an absent message or inaccessible feed.
 * DATEX II v3.1 requires registration with Statens vegvesen. */
(function(){
'use strict';
const ROADS=[
 {name:'Freifjordtunnelen',kind:'Tunnel',route:'Rv. 70'},
 {name:'Atlanterhavstunnelen',kind:'Tunnel',route:'Fv. 64'},
 {name:'Nordsundbrua',kind:'Bru',route:'Kristiansund'},
 {name:'Omsundbrua',kind:'Bru',route:'Kristiansund'},
 {name:'Bergsøysundbrua',kind:'Bru',route:'Krifast'}
];
const ROAD_TRAFFIC_URL='https://www.vegvesen.no/trafikk/';
function paint(){
 for(const id of ['road-status-side','road-status']){
  const el=document.getElementById(id);if(!el)continue;
  el.replaceChildren();
  for(const road of ROADS){
   const row=document.createElement('div');row.className='road-status-row';
   const name=document.createElement('div');name.className='road-status-name';
   name.textContent=road.name;
   const status=document.createElement('span');status.className='road-status-unknown';
   status.textContent='Ikke kontrollert';
   row.append(name,status);el.append(row);
  }
 }
}
window.KsuRoadStatus={roads:ROADS,trafficUrl:ROAD_TRAFFIC_URL,paint};
if(typeof document!=='undefined')paint();
})();
