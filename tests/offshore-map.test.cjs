const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const overlay=fs.readFileSync(path.join(__dirname,'../offshore-map.js'),'utf8');
const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
test('observed offshore tracks are split on signal gaps rather than connected',()=>{
 assert.doesNotThrow(()=>new Function(overlay));
 assert.match(overlay,/GAPS_MS=90\*1000/);
 assert.match(overlay,/Number\(f\.t\)-Number\(segment\[segment\.length-1\]\.t\)>GAPS_MS/);
 assert.match(overlay,/drawSegment\(segment\)/);
 assert.match(overlay,/Siste mottatte posisjon før dekningstap/);
 assert.match(overlay,/Første mottatte posisjon etter dekningstap/);
});
test('possible offshore installation is a proximity hint, not confirmed landing',()=>{
 assert.match(overlay,/const PLATFORM_NEAR_NM=2\.5|PLATFORM_NEAR_NM=2\.5/);
 assert.match(overlay,/fixes\.length<2/);
 assert.match(overlay,/landing ikke bekreftet/);
 assert.match(overlay,/KsuOffshoreCoverage\.snapshot\(\)/);
});
test('selected helicopter overlay is independent from aircraft and AIS map layers',()=>{
 assert.match(app,/KsuOffshoreMap\?\.render\(p\)/);
 assert.match(app,/KsuOffshoreMap\?\.render\(selected\)/);
 assert.match(app,/KsuOffshoreMap\?\.render\(null\)/);
 assert.match(html,/offshore-map\.js\?v=1/);
 assert.ok(html.indexOf('offshore-map.js?v=2')>html.indexOf('app.js?v=237'));
 assert.doesNotMatch(overlay,/\bfetch\s*\(/);
 assert.doesNotMatch(overlay,/\blocalStorage\.setItem\b/);
});
