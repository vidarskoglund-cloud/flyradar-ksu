const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const start=app.indexOf('function renderTrafficNotices(){');
const end=app.indexOf('window.KsuTrafficMap=',start);
assert.ok(start>=0&&end>start);
function render({mobile,zoom,events,inside=()=>true}){
 const markers=[];const trafficNoticeLayer={clearLayers(){}};
 const map={getZoom:()=>zoom,getBounds:()=>({contains:inside})};
 const window={matchMedia:()=>({matches:mobile})};
 const L={divIcon:props=>props,marker:(point)=>({bindPopup(){return this},addTo(){markers.push(point)}})};
 const ctx=vm.createContext({window,map,L,trafficNoticeLayer,currentTrafficNotices:events,
  Number,String,trafficKind:()=> 'work',safeTrafficText:x=>x,formatDatexDate:x=>x});
 vm.runInContext(app.slice(start,end),ctx);
 ctx.renderTrafficNotices();return markers;
}
const event={lat:63.11,lon:7.82,place:'Kristiansund',message:'Vegarbeid'};
test('mobile regional zoom shows traffic notices without requiring street zoom',()=>{
 assert.equal(render({mobile:true,zoom:9,events:[event]}).length,1);
 assert.equal(render({mobile:true,zoom:8,events:[event]}).length,0);
});
test('desktop keeps conservative zoom threshold',()=>{
 assert.equal(render({mobile:false,zoom:9,events:[event]}).length,0);
 assert.equal(render({mobile:false,zoom:12,events:[event]}).length,1);
});
test('mobile pins remain limited to visible map and at most eight',()=>{
 const events=Array.from({length:15},(_,i)=>({...event,lat:63.01+i*.01}));
 assert.equal(render({mobile:true,zoom:10,events}).length,8);
 assert.equal(render({mobile:true,zoom:10,events,inside:p=>p[0]===events[2].lat}).length,1);
});
test('road overlay never changes map zoom or automatically moves the camera',()=>{
 const s=app.slice(start,end);
 assert.doesNotMatch(s,/setView\(|flyTo\(|fitBounds\(|setZoom\(/);
 assert.match(app,/map\.on\('zoomend moveend',renderTrafficNotices\)/);
});
