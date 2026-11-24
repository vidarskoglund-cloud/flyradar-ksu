const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const src=fs.readFileSync(path.join(__dirname,'../map/focus-target.js'),'utf8');
const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const ctx=vm.createContext({});
vm.runInContext(src,ctx);
const choose=ctx.chooseMapFocusTarget;
const now=100000,holdMs=30000;
const fly=(key,rank)=>({key:'fly:'+key,rank,d:10});
const vessel=(key,rank)=>({key:'bat:'+key,rank,d:2});
test('prioritize KSU aircraft over a lower-ranked vessel',()=>{
 const best=fly('ksu',5),current=vessel('harbor',2.8);
 assert.equal(choose({best,current,glimpse:null,routineBoatFocus:false,now,changedAt:now-10000,holdMs}),best);
});
test('retain current target within hold time if no priority increase',()=>{
 const best=fly('other',3),current=fly('current',3);
 assert.equal(choose({best,current,glimpse:null,routineBoatFocus:false,now,changedAt:now-29000,holdMs}),current);
 assert.equal(choose({best,current,glimpse:null,routineBoatFocus:false,now,changedAt:now-30000,holdMs}),best);
});
test('allow occasional glimpse during routine vessel focus',()=>{
 const best=vessel('harbor',2),glimpse=fly('regional',0.5);
 assert.equal(choose({best,glimpse,current:null,routineBoatFocus:true,now,changedAt:0,holdMs}),glimpse);
 assert.equal(choose({best,glimpse,current:null,routineBoatFocus:false,now,changedAt:0,holdMs}),best);
});
test('return null when there are no candidates',()=>{
 assert.equal(choose({best:null,glimpse:null,current:null,routineBoatFocus:false,now,changedAt:0,holdMs}),null);
});
test('load target decision before main app, with no duplicate hold logic',()=>{
 assert.ok(html.indexOf('map/focus-target.js?v=1')>=0);
 assert.ok(html.indexOf('map/focus-target.js?v=1')<html.indexOf('app.js?v=216'));
 assert.match(app,/chooseMapFocusTarget\(\{/);
 assert.doesNotMatch(app,/now-smartMapChangedAt<SMART_MAP_HOLD_MS&&best.rank<=current.rank/);
});
