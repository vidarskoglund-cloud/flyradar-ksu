const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

const geometry=fs.readFileSync(path.join(__dirname,'../map/focus-geometry.js'),'utf8');
const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const context=vm.createContext({Math,Number});
vm.runInContext(geometry,context);

test('heading differences wrap around north correctly',()=>{
 assert.equal(context.angleDiff(359,1),2);
 assert.equal(context.angleDiff(1,359),2);
 assert.equal(context.angleDiff(90,270),180);
 assert.equal(context.angleDiff(45,45),0);
});
test('airport distance is symmetrical and zero for identical positions',()=>{
 assert.equal(context.idleAirportDistanceNm(63.1118,7.8245,63.1118,7.8245),0);
 const a=context.idleAirportDistanceNm(63.1118,7.8245,63.4578,10.9240);
 const b=context.idleAirportDistanceNm(63.4578,10.9240,63.1118,7.8245);
 assert.ok(a>50 && a<100);
 assert.ok(Math.abs(a-b)<1e-8);
});
test('invalid geometric inputs remain distinguishable from valid distances',()=>{
 assert.ok(Number.isNaN(context.idleAirportDistanceNm(NaN,7,63,8)));
});
test('focus helpers load before app and are declared only once',()=>{
 const helper=html.indexOf('map/focus-geometry.js?v=1');
 const main=html.indexOf('app.js?v=222');
 assert.ok(helper>=0&&helper<main);
 assert.doesNotMatch(app,/function angleDiff\s*\(/);
 assert.doesNotMatch(app,/function idleAirportDistanceNm\s*\(/);
 assert.match(geometry,/function angleDiff\s*\(/);
 assert.match(geometry,/function idleAirportDistanceNm\s*\(/);
});
