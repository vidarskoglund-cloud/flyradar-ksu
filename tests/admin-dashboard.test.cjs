const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const load=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const page=load('admin.html');
const app=load('admin.js');
const health=load('admin-health.js');
test('Admin presents core operational services and cost cap before details',()=>{
 for(const id of ['live-planes','live-ais','live-pages','live-worker','fa-state','fa-budget']){
  assert.match(page,new RegExp('id="'+id+'"'));
 }
 assert.ok(page.indexOf('id="operational-title"')<page.indexOf('id="diagnostics-fold"'));
 assert.ok(page.indexOf('id="cost-title"')<page.indexOf('id="diagnostics-fold"'));
 assert.doesNotMatch(page,/PR #50 – vær ved Kvernberget/);
});
test('Administration keeps diagnostics, exports, analytics and history functional',()=>{
 for(const id of ['sources','inactive-sources','metrics','diagnosis','filter','limit','history','refresh','json','csv','clear','test-api','test-results','route25-attempts','route25-found','route25-unresolved','route25-paid','route25-cost','analytics-own-toggle','analytics-own-status']){
  assert.match(page,new RegExp('id="'+id+'"'));
 }
 for(const id of ['diagnostics-fold','analytics-fold','history-fold']){
  assert.match(page,new RegExp('<details[^>]*id="'+id+'"'));
 }
 assert.doesNotThrow(()=>new Function(app));
 assert.doesNotThrow(()=>new Function(health));
});
test('Service checks are read-only, bounded and distinguish health from source data',()=>{
 assert.match(health,/\/health/);
 assert.match(health,/\/aircraft/);
 assert.match(health,/\/vessels/);
 assert.match(health,/14000/);
 assert.match(health,/data\?\.ok===true&&Array\.isArray\(data\?\.vessels\)/);
 assert.doesNotMatch(health,/localStorage|sessionStorage|POST|PUT|DELETE/);
});
