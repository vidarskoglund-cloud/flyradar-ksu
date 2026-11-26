const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../photo-identify.js'),'utf8');
const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const from=src.indexOf('function bearing('),to=src.indexOf('function reset()',from);
const api=Function(src.slice(from,to)+';return {bearing,distanceKm,candidates}')();
test('photo matching computes plausible bearings and filters outside camera direction',()=>{
 assert.ok(Math.abs(api.bearing(63,7,63,8)-90)<2);
 assert.ok(Math.abs(api.bearing(63,7,64,7))<1);
 const hits=api.candidates({lat:63,lon:7,heading:90},[
  {name:'East ship',kind:'ship',lat:63,lon:8,stale:false},
  {name:'West ship',kind:'ship',lat:63,lon:6,stale:false},
  {name:'Expired aircraft',kind:'plane',lat:63,lon:8,stale:true}
 ]);
 assert.equal(hits.length,1);assert.equal(hits[0].name,'East ship');
});
test('original JPEG and EXIF are handled locally; no uploads, tracking or storage',()=>{
 assert.match(src,/function exifJpeg\(buffer\)/);
 assert.match(src,/GPS-posisjon og kameraretning kreves/);
 assert.doesNotMatch(src,/\bfetch\s*\(/);
 assert.doesNotMatch(src,/localStorage|sessionStorage/);
 assert.doesNotMatch(src,/navigator\.geolocation/);
 assert.match(html,/id="photo-identify"/);
 assert.match(html,/photo-identify\.js\?v=2/);
});
test('snapshot rejects old positions and old images are not compared with present',()=>{
 assert.match(app,/window\.KsuPhotoCandidates=function/);
 assert.match(app,/fresh\(Number\(p\.positionAt\)\)/);
 assert.match(app,/fresh\(aisTime\(v\.msgtime\)\)/);
 assert.match(src,/Math\.abs\(snapshot\.at-photoTime\)>5\*60\*1000/);
 assert.match(src,/Ikke bekreftet identifikasjon/);
});
