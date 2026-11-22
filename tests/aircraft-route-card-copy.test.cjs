const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const start=source.indexOf('function routeLookupLabel(p){');
const end=source.indexOf('function displayRoute(p)',start);
assert.ok(start>0&&end>start);
const ctx={};
vm.runInNewContext(source.slice(start,end)+';globalThis.label=routeLookupLabel;',ctx);
const label=ctx.label;
test('no lookup eligibility policy is exposed in public aircraft card',()=>{
 assert.equal(label({flight:'NOZ417',d:55.7}), '');
 assert.doesNotMatch(source,/Ikke kvalifisert for ekstra ruteoppslag/);
 assert.match(source,/routeLookupLabel\(shown\)\|\|'Avgang og destinasjon ikke bekreftet'/);
 assert.doesNotMatch(source,/class="route-state">\$\{routeLookupLabel\(shown\)\}/);
});
test('distinguish a pending lookup, a no-match and an API failure without jargon',()=>{
 assert.equal(label({routeLookupState:'trying'}),'Søker etter flyrute…');
 assert.equal(label({routeLookupState:'not-found'}),'Ingen bekreftet rute funnet');
 assert.equal(label({routeLookupState:'error'}),'Ruteinformasjon midlertidig utilgjengelig');
 assert.equal(label({routeData:{airport_codes:'OSL-BGO'}}),'');
});
test('keep route eligibility and budget limits unchanged',()=>{
 assert.match(source,/function routeLookupScope\(p\)/);
 assert.match(source,/isActive50=.*nm\(p\.d\)<=50/);
 assert.match(source,/function runFreeRoutePilot25\(/);
 assert.match(source,/pilot25-free/);
});
