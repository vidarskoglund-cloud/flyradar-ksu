const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
test('origin and KSU remote positions use the existing adsb.fi provider',()=>{
 assert.match(app,/opendata\.adsb\.fi\/api\/v2\/callsign\//);
 assert.match(app,/opendata\.adsb\.fi\/api\/v3\/lat\/\$\{origin\.lat\}\/lon\/\$\{origin\.lon\}\/dist\/25/);
 assert.match(app,/opendata\.adsb\.fi\/api\/v3\/lat\/\$\{ksu\.lat\}\/lon\/\$\{ksu\.lon\}\/dist\/25/);
 assert.doesNotMatch(app,/api\.adsb\.lol\/v2\/(?:point|callsign)\//);
 assert.match(app,/_source:'adsb\.fi · KSU fjernsporing'/);
});
test('origin route checks have a per-day callsign guard and a two-candidate limit',()=>{
 const match=app.match(/function remoteKsuOriginRouteKey\([\s\S]*?\n\}/);
 assert.ok(match);
 const ctx=vm.createContext({Date,String});
 vm.runInContext(match[0],ctx);
 assert.equal(ctx.remoteKsuOriginRouteKey('wif5dy',Date.UTC(2026,10,24)), '2026-11-24|WIF5DY');
 assert.match(app,/remoteKsuRouteChecked\.has\(key\)/);
 assert.match(app,/remoteKsuRouteChecked\.add\(key\)/);
 assert.match(app,/if\(checked>=2\)break/);
 assert.match(app,/remoteKsuCandidateRoute\(a\)/);
});
test('origin lookups use existing Worker route and budget gate, not a new paid service',()=>{
 assert.match(app,/return routeForCallsign\(callsign,a\.lat,a\.lon,a\.alt_baro\?\?a\.alt_geom,'ksu'\)/);
 assert.match(app,/flyradar-ksu\.vidar-skoglund\.workers\.dev\/route/);
 assert.ok(html.indexOf('app.js?v=221')>0);
});
