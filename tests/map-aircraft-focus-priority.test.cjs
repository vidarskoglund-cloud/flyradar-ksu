const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

const src=fs.readFileSync(path.join(__dirname,'../map/aircraft-focus-priority.js'),'utf8');
const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const ctx=vm.createContext({});
vm.runInContext(src,ctx);
const score=opts=>ctx.rankAircraftMapFocus(opts);

test('ground movement and final approach remain strongest KSU priorities',()=>{
 assert.equal(score({groundLike:true,stationary:false,d:1}),6);
 assert.equal(score({groundLike:true,stationary:true,d:1}),0);
 assert.equal(score({finalApproach:true,d:3,role:{rank:4.8}}),5.5);
});
test('confirmed KSU arrival and departure retain their rank and distance boundaries',()=>{
 assert.equal(score({arrival:true,approach:true,d:80}),5);
 assert.equal(score({arrival:true,approach:false,d:49}),5);
 assert.equal(score({arrival:true,approach:false,d:60,towardKsu:true}),2.5);
 assert.equal(score({departure:true,d:25,stationary:false}),4);
 assert.equal(score({departure:true,d:26,stationary:false}),0);
});
test('inbound motion and local aircraft retain priority thresholds',()=>{
 assert.equal(score({inboundByMotion:true,d:50}),3.5);
 assert.equal(score({inboundByMotion:true,d:60}),2.5);
 assert.equal(score({d:10,stationary:false}),3.2);
 assert.equal(score({d:25,stationary:false}),3);
 assert.equal(score({d:25.1,stationary:false}),0);
});
test('special service receives local boost without overriding stronger KSU evidence',()=>{
 assert.equal(score({d:30,role:{rank:4.8}}),4.8);
 assert.equal(score({d:51,role:{rank:4.8}}),0);
 assert.equal(score({groundLike:true,stationary:false,d:1,role:{rank:4.8}}),6);
});
test('priority module loads before app and legacy rank sequence has been removed',()=>{
 const helper=html.indexOf('map/aircraft-focus-priority.js?v=1');
 const main=html.indexOf('app.js?v=217');
 assert.ok(helper>=0 && helper<main);
 assert.match(app,/rankAircraftMapFocus\(\{/);
 assert.doesNotMatch(app,/if\(groundLike&&!stationary\)rank=6/);
 assert.match(src,/if\(groundLike&&!stationary\)rank=6/);
});
