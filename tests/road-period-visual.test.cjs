const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const js=fs.readFileSync(path.join(__dirname,'../road-status.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
test('road statuses are tagged with announced time period, not live activity',()=>{
 assert.match(js,/status\.dataset\.phase=eventPhase\(event\)/);
 assert.match(js,/Varslet tidsperiode – aktivitet er ikke bekreftet/);
 assert.match(js,/if\(phase==='planned'\)return 'Planlagt/);
 assert.match(js,/if\(phase==='period'\)return label\+' · i perioden'/);
});
test('visual phase cues are distinct and limited to road statuses',()=>{
 for(const phase of ['planned','period','ended','unknown'])
  assert.ok(html.includes('.road-status-unknown[data-phase="'+phase+'"]'));
 assert.match(html,/road-status\.js\?v=15/);
});