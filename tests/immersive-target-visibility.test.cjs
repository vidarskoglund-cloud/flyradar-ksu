const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const start=app.indexOf('function ensureImmersiveTargetVisible(){');
const end=app.indexOf('function queueImmersiveTargetVisibility(){',start);
assert.ok(start>0&&end>start);
const code=app.slice(start,end);
function panFor(landscape,x,y,cover,immersive=true){
 const calls=[];
 const map={getContainer:()=>({getBoundingClientRect:()=>({left:0,top:0,width:800,height:landscape?380:950})}),
  latLngToContainerPoint:()=>({x,y}),panBy:delta=>calls.push(delta)};
 const document={body:{classList:{contains:()=>immersive}},
  querySelector:()=>({getBoundingClientRect:()=>cover})};
 const window={matchMedia:()=>({matches:landscape})};
 const vessel={lat:63,lon:7,signalLost:false};
 const fn=Function('map','document','window','vessels','selectedVesselTypeKey','vesselKey','selected',
   code+';return ensureImmersiveTargetVisible;')(map,document,window,[vessel],'ship',()=> 'ship',null);
 fn();return calls;
}
test('Portrait brings a selected vessel above expanded bottom sheet',()=>{
 assert.deepEqual(panFor(false,380,880,{left:0,top:600,right:800,bottom:950}),[[0,320]]);
 assert.deepEqual(panFor(false,380,350,{left:0,top:600,right:800,bottom:950}),[]);
});
test('Landscape pans selected vessel left of right-hand panel',()=>{
 assert.deepEqual(panFor(true,740,240,{left:520,top:60,right:800,bottom:380}),[[260,0]]);
 assert.deepEqual(panFor(true,300,240,{left:520,top:60,right:800,bottom:380}),[]);
});
test('Normal map layout is unchanged and resize triggers visibility correction',()=>{
 assert.deepEqual(panFor(false,380,880,{left:0,top:600,right:800,bottom:950},false),[]);
 assert.match(html,/window\.KsuEnsureSelectedVisible\?\.\(\)/);
 assert.match(html,/app\.js\?v=235/);
});
