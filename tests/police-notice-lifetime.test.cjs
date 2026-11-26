const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../police-status-v6.js'),'utf8');
const worker=fs.readFileSync(path.join(__dirname,'../worker/src/index.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
test('police controls are short-lived and not prominent for speed checks',()=>{
 assert.match(source,/isTrafficControl\(item\)/);
 assert.match(source,/!isTrafficControl\(item\)/);
 assert.match(source,/30\*60000/);
 assert.match(source,/isTrafficControl\(i\)\?30\*60000/);
 assert.match(source,/policeUrl\(item\)/);
 assert.match(source,/noopener noreferrer/);
 assert.match(html,/police-status-20261126\.js/);
});
test('only generic categories from public messages; no made-up coordinates',()=>{
 assert.match(worker,/const classification=/);
 assert.match(worker,/Trafikkontroll/);
 assert.match(worker,/never re-publish/);
 assert.doesNotMatch(worker,/records\.set\(id, \{[^\n]*\blat\b/);
});

test('traffic checks use independent Oslo clock expiry guard',()=>{
 assert.match(source,/function osloClockMinutes\(value\)/);
 assert.match(source,/function trafficControlAgeOk\(i,now\)/);
 assert.match(source,/trafficControlAgeOk\(i,now\)/);
 assert.match(source,/clockNow-event\+1440/);
});
