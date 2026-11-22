const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
test('compact desktop row places vessel status to left and aircraft counters to right',()=>{
 assert.match(html,/#vessel-live-status\{grid-area:rule/);
 assert.match(html,/#stats\{grid-area:stats/);
 assert.match(html,/"rule stats"\s*"map aircraft"/);
 assert.match(html,/@media\(min-width:900px\) and \(display-mode:browser\)/);
});
test('existing live stat bindings and fullscreen controls remain intact',()=>{
 for(const id of ['vessel-live-status','count','closest','updated','fs-count','fs-closest','fs-updated','map','cards','type-info'])
   assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(app,/\$\('count'\)/);
 assert.match(app,/\$\('closest'\)/);
 assert.match(app,/\$\('updated'\)/);
 assert.match(html,/@media\(min-width:900px\) and \(display-mode:fullscreen\)/);
});
test('no status data fetch or source logic is changed',()=>{
 assert.match(html,/id="adsb-source-label"/);
 assert.match(html,/id="vessel-live-status"/);
 assert.match(html,/vessel-wikidata\.js/);
 assert.match(html,/vessel-photos\.js/);
});
