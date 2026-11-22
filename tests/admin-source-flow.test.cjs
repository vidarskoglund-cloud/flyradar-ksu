const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../admin.html'),'utf8');
const js=fs.readFileSync(path.join(__dirname,'../admin.js'),'utf8');
test('aircraft position source is first, routing and inactive positions separate',()=>{
 const order=['1. Flyposisjoner – aktiv kilde','2. Ruteoppslag – egen tjeneste','3. Flyposisjonskilder som ikke brukes nå','Slik flyter dataene'];
 for(let i=1;i<order.length;i++)assert.ok(html.indexOf(order[i])>html.indexOf(order[i-1]));
 assert.match(html,/id="sources"/);assert.match(html,/id="inactive-sources"/);
 assert.match(js,/const sources=\[\['adsb\.fi','adsbFi'\]/);
});
test('not-used aircraft sources are not confused with route service failures',()=>{
 assert.match(html,/Ikke brukt.*ikke nødvendigvis ute av drift/);
 assert.match(js,/denne statustelleren måler ikke ruteoppslag/);
 assert.match(js,/POSISJONSKILDE · IKKE AKTIV/);
 assert.match(js,/Historiske posisjonsmålinger/);
});
test('route pilot and budget displays remain separated and visible',()=>{
 for(const id of ['fa-usage','route25-stats','route25-attempts','route25-found','route25-cost','metrics','history'])assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(html,/4,50 USD/);assert.match(html,/uten betalt fallback/);
});
test('no tracking, sources or telemetry logic changed in dashboard',()=>{
 assert.match(html,/id="diagnosis"/);
 assert.match(html,/id="test-api"/);
 assert.match(js,/const WORKER_TEST_URL=/);
 assert.match(js,/const FI_TEST_URL=/);
});
