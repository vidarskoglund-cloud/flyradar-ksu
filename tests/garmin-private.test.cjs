const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const script=fs.readFileSync(path.join(__dirname,'../garmin-private.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
test('Garmin layer is opt-in and local to the current browser tab',()=>{
 assert.doesNotThrow(()=>new Function(script));
 assert.match(script,/DOMParser\(\)/);
 assert.match(script,/parseGarminKml\(await file\.text\(\)\)/);
 assert.match(script,/group\.clearLayers\(\)/);
 assert.match(script,/toggle\.addEventListener\('change',render\)/);
 assert.doesNotMatch(script,/\bfetch\s*\(/);
 assert.doesNotMatch(script,/\blocalStorage\b|\bsessionStorage\b/);
 assert.match(html,/id="garmin-kml-file"/);
 assert.match(html,/garmin-private\.js\?v=1/);
 assert.match(html,/id="garmin-clear"/);
});
test('KML import rejects DTD, invalid locations, and excessive file sizes',()=>{
 assert.match(script,/<!DOCTYPE\|<!ENTITY/i);
 assert.match(script,/file\.size>3e6/);
 assert.match(script,/Math\.abs\(parts\[0\]\)>180/);
 assert.match(script,/Math\.abs\(parts\[1\]\)>90/);
});
