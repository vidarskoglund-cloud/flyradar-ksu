const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const start=app.indexOf('const AIRLINE_ICON_STYLES=');
const end=app.indexOf('function planeKey(p)',start);
assert.ok(start>=0&&end>start);
const state=new Function('L','getTrackDeg','isHelicopter','localRelevant','specialFlightCategory',
 app.slice(start,end)+';return {planeIcon,aircraftAirlineIcon,helicopterIconCategory};')(
 {divIcon:options=>options},
 p=>Number(p.track??0),
 p=>p.type==='S92',
 ()=>false,
 p=>p.role?{id:p.role,label:p.role}:null
);
test('known airline ICAO callsigns receive matching map-only badges',()=>{
 for(const [flight,cls,label] of [
  ['WIF5AD','airline-wideroe','WF'],
  ['SAS2303','airline-sas','SK'],
  ['NOZ428','airline-norwegian','DY'],
  ['NAX102','airline-norwegian','DY']
 ]){
  const icon=state.planeIcon({flight,track:145,type:'DH8D'});
  assert.match(icon.className,new RegExp(cls));
  assert.ok(icon.html.includes('>'+label+'</span>'));
  assert.match(icon.html,/rotate\(145deg\)/);
  assert.deepEqual(icon.iconSize,[34,34]);
 }
});
test('unknown, incomplete and misleading callsigns retain generic aircraft style',()=>{
 for(const flight of ['ICE343','WIF','XWIF123','SAS-123','WIFLIGHT']){
  const icon=state.planeIcon({flight,track:18,type:'B738'});
  assert.equal(icon.className,'plane-wrap');
  assert.doesNotMatch(icon.html,/airline-marker-label/);
 }
});
test('helicopters cannot be branded as fixed-wing airline aircraft',()=>{
 const icon=state.planeIcon({flight:'WIF5AD',track:74,type:'S92'});
 assert.match(icon.className,/heli-general/);
 assert.match(icon.html,/helicopter/);
});
test('brand labels remain horizontal while aircraft itself rotates',()=>{
 const icon=state.planeIcon({flight:'SAS2303',track:210,type:'A320'});
 assert.match(icon.html,/rotate\(210deg\)/);
 assert.match(icon.html,/<\/div><span class="airline-marker-label"/);
 assert.match(html,/\.plane-wrap\.airline-known \.airline-marker-label/);
 assert.match(html,/\.plane-wrap\.is-selected\.airline-known \.plane-marker/);
 assert.match(html,/app\.js\?v=225/);
});
test('classification does not introduce paid API or network lookups',()=>{
 assert.doesNotMatch(app.slice(start,end),/fetch\(|workers\.dev|FlightAware|\/route/);
});

test('helicopter category precedence and rotor silhouette',()=>{
 for(const [p,category] of [
  [{type:'S92',flight:'HKS123'},'offshore'],
  [{type:'S92',flight:'HKS123',role:'rescue'},'rescue'],
  [{type:'S92',flight:'HKS123',role:'military'},'military'],
  [{type:'S92',flight:'HKS123',role:'rescue',squawk:'7700'},'emergency'],
  [{type:'S92',flight:'N123AB'},'general']
 ]){
  const icon=state.planeIcon(p);
  assert.match(icon.className,new RegExp('heli-'+category));
  assert.match(icon.html,/heli-rotor/);
 }
});
