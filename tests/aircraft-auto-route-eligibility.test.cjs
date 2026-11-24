const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../aircraft/auto-route-eligibility.js'),'utf8');
const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const context=vm.createContext({});
vm.runInContext(source,context);
const eligible=context.automaticKsuRouteEligible;
test('confirmed KSU flight may get a route up to 50 NM',()=>{
 assert.equal(eligible({flight:'WIF5DY',ksuFlight:{flight_id:'WF570'}},50,''),true);
 assert.equal(eligible({flight:'WIF5DY',ksuFlight:{flight_id:'WF570'}},50.1,''),false);
});
test('unmatched observed final approach qualifies within 25 NM only',()=>{
 const p={flight:'WIF5DY'};
 assert.equal(eligible(p,10.6,'Ser ut til å være på innflyging'),true);
 assert.equal(eligible(p,25,'Ser ut til å være på innflyging'),true);
 assert.equal(eligible(p,25.1,'Ser ut til å være på innflyging'),false);
 assert.equal(eligible(p,10.6,'Mulig innflyging mot KSU'),false);
});
test('never enrich stale, anonymous or already confirmed planes',()=>{
 assert.equal(eligible({flight:'WIF5DY',signalLost:true,ksuFlight:{}},10,''),false);
 assert.equal(eligible({ksuFlight:{}},10,''),false);
 assert.equal(eligible({flight:'WIF5DY',routeData:{airport_codes:'BGO-KSU'},ksuFlight:{}},10,''),false);
 assert.equal(eligible({flight:'WIF5DY'},Infinity,'Ser ut til å være på innflyging'),false);
});
test('automatic lookup is bounded and reuses worker guarded fallback',()=>{
 assert.match(app,/const automaticKsuRouteAttempted=new Set\(\)/);
 assert.match(app,/AUTOMATIC_KSU_ROUTE_GAP_MS=20000/);
 assert.match(app,/automaticKsuRouteAttempted\.has\(key\)/);
 assert.match(app,/automaticKsuRouteAttempted\.add\(key\)/);
 assert.match(app,/void enrichRoute\(candidate\)/);
 assert.match(app,/queueAutomaticKsuRouteLookup\(planes\)/);
 assert.ok(app.indexOf('queueAutomaticKsuRouteLookup(planes)')<app.indexOf('void runFreeRoutePilot25(planes)'));
 assert.ok(html.indexOf('aircraft/auto-route-eligibility.js?v=1')<html.indexOf('app.js?v=220'));
});
