const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../map/focus-motion-decision.js'),'utf8');
const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const ctx=vm.createContext({Math});
vm.runInContext(source,ctx);
const decide=ctx.shouldMoveMapFocus;
const base={pointsVisible:true,focusedOutside:false,currentZoom:11,wantedZoom:11,
  target:{key:'fly:A',d:10},targetChanged:false,now:100000,lastMoveAt:90000,cooldownMs:12000};
test('avoid unnecessary movement when bounds and zoom are already close',()=>{
 assert.equal(decide({...base}),false);
 assert.equal(decide({...base,currentZoom:10,wantedZoom:11}),false);
 assert.equal(decide({...base,currentZoom:9,wantedZoom:11,lastMoveAt:0}),true);
});
test('honor movement cooldown except for nearby traffic',()=>{
 assert.equal(decide({...base,pointsVisible:false,lastMoveAt:99000}),false);
 assert.equal(decide({...base,pointsVisible:false,lastMoveAt:99000,target:{d:5}}),true);
 assert.equal(decide({...base,pointsVisible:false,lastMoveAt:99000,targetChanged:true}),true);
 assert.equal(decide({...base,pointsVisible:false,lastMoveAt:88000}),true);
});
test('offscreen selected aircraft bypasses cooldown; no target can reframe',()=>{
 assert.equal(decide({...base,pointsVisible:false,focusedOutside:true,lastMoveAt:99999}),true);
 assert.equal(decide({...base,pointsVisible:false,target:null}),true);
});
test('load decision before app and retain real map movement in app',()=>{
 assert.ok(html.indexOf('map/focus-motion-decision.js?v=1')>=0);
 assert.ok(html.indexOf('map/focus-motion-decision.js?v=1')<html.indexOf('app.js?v=218'));
 assert.match(app,/shouldMoveMapFocus\(\{/);
 assert.match(app,/map\.flyToBounds\(bounds,opts\)/);
 assert.match(app,/map\.fitBounds\(bounds,opts\)/);
 assert.match(app,/now<manualMapUntil/);
});
