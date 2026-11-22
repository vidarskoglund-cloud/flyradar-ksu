const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const src=fs.readFileSync(path.join(__dirname,'../vessel-wikidata.js'),'utf8');
const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const page=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const begin=src.indexOf('function parseMatches('),end=src.indexOf('async function requestMatch(',begin);
const context={};
vm.runInNewContext(src.slice(begin,end)+';globalThis.parse=parseMatches;',context);
const parse=context.parse;
const record=(qid,imo,mmsi,more={})=>({ship:{value:'https://www.wikidata.org/entity/'+qid},imo:imo?{value:imo}:undefined,mmsi:mmsi?{value:mmsi}:undefined,...more});
test('Wikidata source is used only after exact AIS identifiers match',()=>{
 const ids={imo:'9579468',mmsi:'257041670'};
 const ok=parse([record('Q12345','9579468','257041670',{typeLabel:{value:'Cargo ship'},entry:{value:'2014-01-01T00:00:00Z'}})],ids);
 assert.equal(ok?.qid,'Q12345');
 assert.equal(ok?.type,'Cargo ship');
 assert.equal(ok?.serviceYear,'2014');
 assert.equal(parse([record('Q12345','9579468','111111111')],ids),null);
 assert.equal(parse([record('Q12345','1234567','257041670')],ids),null);
});
test('Wikidata ambiguity and mismatched identity are rejected',()=>{
 const ids={imo:'9579468',mmsi:''};
 assert.equal(parse([record('Q12345','9579468',''),record('Q54321','9579468','')],ids),null);
 assert.equal(parse([record('Q12345','9579469','')],ids),null);
 assert.equal(parse([record('Q12345','','')],ids),null);
});
test('Wikidata lookup does not guess vessel by name',()=>{
 assert.match(src,/\?ship wdt:'\+property/);
 assert.match(src,/requestMatch\('P458'/);
 assert.match(src,/requestMatch\('P587'/);
 assert.match(src,/if\(!ids\.imo&&!ids\.mmsi\)return \{status:'no-id'\}/);
 assert.match(src,/cacheSave\(key,value\)/);
});
test('Wikidata is optional and cannot overwrite AIS',()=>{
 assert.match(src,/entry\.textContent=name\+': '\+value/);
 assert.match(src,/vessel-wikidata/);
 assert.match(app,/window\.loadSelectedVesselFacts\(vessel,identity\)/);
 assert.match(app,/data-vessel-speed/);
 assert.match(page,/vessel-wikidata\.js\?v=1/);
 assert.match(src,/dataset\.photoIdentity!==identity/);
});
