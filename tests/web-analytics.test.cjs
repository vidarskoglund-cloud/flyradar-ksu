const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const beacon=fs.readFileSync(path.join(__dirname,'../analytics/beacon.js'),'utf8');
const config=fs.readFileSync(path.join(__dirname,'../analytics/config.js'),'utf8');
const index=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const admin=fs.readFileSync(path.join(__dirname,'../admin.html'),'utf8');
function simulate({token='1234567890abcdef1234567890abcdef',excluded=false,query='',host='vidarskoglund-cloud.github.io'}={}){
 const storage=new Map(excluded?[['flyradar-ksu-exclude-my-visits-v1','true']]:[]);
 const appended=[];
 const document={head:{appendChild:s=>appended.push(s)},createElement:()=>({dataset:{}})};
 const ctx=vm.createContext({window:{FLYRADAR_ANALYTICS_TOKEN:token},document,
  location:{search:query,hostname:host},URLSearchParams,
  localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},String});
 vm.runInContext(beacon,ctx);
 return {storage,appended};
}
test('beacon is disabled until Cloudflare site token has been configured',()=>{
 assert.match(config,/FLYRADAR_ANALYTICS_TOKEN=''/);
 assert.equal(simulate({token:''}).appended.length,0);
 assert.equal(simulate({token:'INVALID'}).appended.length,0);
});
test('a valid token loads the beacon only on production Pages',()=>{
 const result=simulate();
 assert.equal(result.appended.length,1);
 assert.equal(result.appended[0].src,'https://static.cloudflareinsights.com/beacon.min.js');
 assert.equal(JSON.parse(result.appended[0].dataset.cfBeacon).spa,false);
 assert.equal(simulate({host:'localhost'}).appended.length,0);
});
test('owner exclusion blocks the beacon before any network request',()=>{
 assert.equal(simulate({excluded:true}).appended.length,0);
 const enabled=simulate({query:'?exclude_stats=1'});
 assert.equal(enabled.appended.length,0);
 assert.equal(enabled.storage.get('flyradar-ksu-exclude-my-visits-v1'),'true');
 const reset=simulate({excluded:true,query:'?exclude_stats=0'});
 assert.equal(reset.appended.length,1);
});
test('analytics does not call Worker or change fly/AIS processing',()=>{
 assert.doesNotMatch(beacon,/workers\.dev|fetch\(|\/aircraft|\/vessels|\/route/);
 assert.ok(index.indexOf('analytics/config.js?v=1')<index.indexOf('analytics/beacon.js?v=1'));
 assert.ok(admin.includes('analytics/owner-control.js?v=1'));
 assert.ok(!admin.includes('analytics/beacon.js?v=1'));
 assert.ok(admin.includes('id="analytics-own-toggle"'));
});
