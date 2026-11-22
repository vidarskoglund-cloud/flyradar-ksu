const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const page=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const start=app.indexOf('function upcomingSchedule(');
const end=app.indexOf('function compactFlightId(',start);
assert.ok(start>=0&&end>start);
function setup(now,flights,planes=[]){
 const nodes={
  'avinor-list':{innerHTML:''},
  'avinor-list-side':{innerHTML:''}
 };
 const ctx={
  avinorFlights:flights,planes,Date,Math,Number,String,
  $:id=>nodes[id],nm:x=>x,
  avinorFlightKey:f=>f.flight_id,
  scheduleDisplayTime:f=>{
   const updated=f.status_code==='E'?Date.parse(f.status_time||''):NaN;
   return Number.isFinite(updated)?updated:Date.parse(f.schedule_time||'');
  }
 };
 vm.runInNewContext(app.slice(start,end),ctx);
 ctx.Date=class extends Date{static now(){return now;}};
 vm.runInNewContext(app.slice(start,end),ctx);
 return {ctx,nodes};
}
const at='2026-11-22T20:00:00Z';
const flight=(id,time,code='',revised='')=>({
 flight_id:id,airport:'BGO',arr_dep:'A',
 schedule_time:time,status_code:code,status_time:revised
});
test('heading names arrivals and departures clearly',()=>{
 assert.equal((page.match(/Flyavganger og ankomster · KSU/g)||[]).length,2);
 assert.doesNotMatch(page,/<h[23]>Neste på KSU<\/h[23]>/);
});
test('planned and revised times are differentiated from source fields',()=>{
 const {ctx}=setup(Date.parse(at),[]);
 const normal=ctx.avinorTimeInfo(flight('WF100','2026-11-22T21:00:00Z'));
 assert.equal(normal.changed,false);
 const delayed=ctx.avinorTimeInfo(flight('WF200','2026-11-22T21:00:00Z','E','2026-11-22T21:20:00Z'));
 assert.equal(delayed.changed,true);
 assert.equal(delayed.delayed,true);
 const early=ctx.avinorTimeInfo(flight('WF300','2026-11-22T21:00:00Z','E','2026-11-22T20:50:00Z'));
 assert.equal(early.changed,true);
 assert.equal(early.delayed,false);
 const noRevision=ctx.avinorTimeInfo(flight('WF400','2026-11-22T21:00:00Z','E',''));
 assert.equal(noRevision.changed,false);
});
test('old and completed departures or arrivals are omitted',()=>{
 const {ctx}=setup(Date.parse(at),[]);
 assert.equal(ctx.upcomingSchedule(flight('OLD','2026-11-22T18:00:00Z'),Date.parse(at)),false);
 assert.equal(ctx.upcomingSchedule(flight('LAND','2026-11-22T21:00:00Z','A'),Date.parse(at)),false);
 assert.equal(ctx.upcomingSchedule(flight('DEPT','2026-11-22T21:00:00Z','D'),Date.parse(at)),false);
 assert.equal(ctx.upcomingSchedule(flight('NEXT','2026-11-22T21:00:00Z'),Date.parse(at)),true);
});
test('tracked aircraft is prioritized and revised times have clear labels',()=>{
 const flights=[
  flight('WF100','2026-11-22T20:20:00Z'),
  flight('WF200','2026-11-22T21:00:00Z','E','2026-11-22T21:25:00Z'),
  flight('WF300','2026-11-22T21:40:00Z')
 ];
 const planes=[{ksuFlight:flights[2],signalLost:false,d:12}];
 const {ctx,nodes}=setup(Date.parse(at),flights,planes);
 ctx.renderAvinor();
 const html=nodes['avinor-list-side'].innerHTML;
 assert.ok(html.indexOf('WF300')<html.indexOf('WF100'));
 assert.match(html,/WF200[\s\S]*Forsinket[\s\S]*Planlagt/);
 assert.match(html,/Ny tid/);
 assert.match(html,/Følges nå/);
 assert.match(html,/12 NM fra KSU/);
 assert.match(html,/class="schedule-time-label">Planlagt/);
});
test('Avinor source and polling remain unchanged',()=>{
 assert.match(app,/data\/avinor-ksu\.json/);
 assert.match(app,/setInterval\(loadAvinor,600000\)/);
 assert.match(page,/schedule-time-label/);
});
