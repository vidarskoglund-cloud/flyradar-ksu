const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

const source=fs.readFileSync(path.join(__dirname,'../aircraft/track-history.js'),'utf8');
const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
function setup(initial=null){
  const store=new Map(initial?[['flyradar-ksu-trails-v1',JSON.stringify(initial)]]:[]);
  const localStorage={
    getItem:key=>store.has(key)?store.get(key):null,
    setItem:(key,val)=>store.set(key,val)
  };
  const context=vm.createContext({Date,Number,Math,Map,JSON,Array,String,localStorage,console});
  vm.runInContext(source+'\n globalThis.trackTest={trackHistory,validTrackPoint,persistTrackHistory,restoreTrackHistory,TRACK_KEEP_MS,TRACK_MAX_POINTS};',context);
  return {state:context.trackTest,store};
}
test('only valid recent positions are restored',()=>{
  const now=Date.now();
  const {state}=setup([{key:'abc123',points:[
    {lat:63.11,lon:7.82,t:now-30000},
    {lat:110,lon:7.82,t:now-20000},
    {lat:63,lon:7,t:now-31*60000}
  ]}]);
  assert.equal(state.trackHistory.get('abc123').length,1);
});
test('track points outside the age window or geographical bounds are rejected',()=>{
  const {state}=setup();
  const now=Date.now();
  assert.equal(state.validTrackPoint({lat:63,lon:7,t:now-1000},now-1800000,now),true);
  assert.equal(state.validTrackPoint({lat:91,lon:7,t:now-1000},now-1800000,now),false);
  assert.equal(state.validTrackPoint({lat:63,lon:7,t:now-1900000},now-1800000,now),false);
});
test('persist limits track history size and uses existing storage key',()=>{
  const {state,store}=setup();
  const now=Date.now();
  state.trackHistory.set('abc123',Array.from({length:200},(_,i)=>({lat:63,lon:7,t:now-100000+i*100})));
  state.persistTrackHistory();
  const saved=JSON.parse(store.get('flyradar-ksu-trails-v1'));
  assert.equal(saved.length,1);
  assert.equal(saved[0].points.length,140);
});
test('module loads before app.js without duplicate persistence definitions',()=>{
  assert.ok(html.indexOf('aircraft/track-history.js?v=1')>=0);
  assert.ok(html.indexOf('aircraft/track-history.js?v=1')<html.indexOf('app.js?v=223'));
  assert.doesNotMatch(app,/function restoreTrackHistory\s*\(/);
  assert.match(source,/function restoreTrackHistory\s*\(/);
});
