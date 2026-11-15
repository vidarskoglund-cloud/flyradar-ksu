(function(){
  const byId=(id)=>document.getElementById(id);
  const STATUS_URL='https://flyradar-ksu.vidar-skoglund.workers.dev/flightaware/status';

  async function loadFlightAwareStatus(){
    const box=byId('fa-usage');
    if(!box)return;
    try{
      const r=await fetch(STATUS_URL,{cache:'no-store',credentials:'omit'});
      if(!r.ok)throw new Error('HTTP '+r.status);
      const j=await r.json();

      const calls=Number(j.calls||0);
      const spent=Number(j.spent||0);
      const actualRaw=Number(j.actual_cost);
      const actual=Number.isFinite(actualRaw)?actualRaw:null;
      const budget=Number(j.budget||4.5);
      const guardOk=j.usage_guard_ok!==false && j.allowed!==false;
      const used=Math.max(spent,actual===null?0:actual);
      const pct=budget>0?Math.max(0,Math.min(100,(used/budget)*100)):0;

      byId('fa-state').textContent=guardOk?'Aktiv':'Stoppet';
      byId('fa-state').className=guardOk?'fa-ok':'fa-warn';
      byId('fa-calls').textContent=String(calls);
      byId('fa-spent').textContent='$'+spent.toFixed(3);
      byId('fa-actual').textContent=actual===null?'venter':'$'+actual.toFixed(3);
      byId('fa-budget').textContent='$'+budget.toFixed(2);
      byId('fa-progress').style.width=pct.toFixed(1)+'%';
      byId('fa-note').textContent='Bruk: '+pct.toFixed(1)+' % av intern grense · FlightAware kan ligge 10–20 min etter.';
    }catch(e){
      if(byId('fa-state')){
        byId('fa-state').textContent='Ukjent';
        byId('fa-state').className='fa-warn';
      }
      if(byId('fa-note'))byId('fa-note').textContent='Kunne ikke hente FlightAware-bruk akkurat nå.';
    }
  }

  loadFlightAwareStatus();
  setInterval(loadFlightAwareStatus,300000);
})();