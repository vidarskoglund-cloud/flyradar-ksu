const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const start=html.indexOf('/* Ordinary desktop: make the primary radar view fit');
const stop=html.indexOf('</style>',start);
const rule=html.slice(start,stop);
test('desktop ordinary-browser view uses bounded viewport with footer still visible',()=>{
 assert.ok(start>=0);
 assert.match(rule,/@media \(min-width:900px\) and \(min-height:640px\) and \(display-mode:browser\)/);
 assert.match(rule,/grid-template-rows:auto minmax\(0,1fr\) auto/);
 assert.match(rule,/grid-template-rows:36px minmax\(0,1fr\) auto/);
 assert.match(rule,/grid-template-areas:"rule stats" "map aircraft" "settings settings"/);
 assert.match(rule,/body:not\(\.display-on\) footer/);
 assert.doesNotMatch(rule,/footer\s*\{[^}]*display:none/);
});
test('no global scroll and tall vessel details use local accessible scroll',()=>{
 assert.match(rule,/body:not\(\.display-on\)\{[^}]*overflow:hidden/);
 assert.match(rule,/\.nearest-panel\{[^}]*overflow-y:auto/);
 assert.match(rule,/#map\{[^}]*height:100%!important/);
 assert.match(rule,/settings-panel\[open\]\{[^}]*overflow-y:auto/);
});
test('narrow viewport and fullscreen retain own layouts and controls',()=>{
 assert.match(html,/@media\(max-width:700px\)/);
 assert.match(html,/@media\(min-width:900px\) and \(display-mode:fullscreen\)/);
 for(const id of ['count','closest','updated','map','vessel-live-status','cards','type-info','notify','proximity-sound'])
  assert.ok(html.includes('id="'+id+'"'),id);
});

test('at 100 percent zoom laptop view compacts every sidebar section but keeps them visible',()=>{
 const css=html.slice(html.indexOf('/* Fit all live information at 100%'),html.indexOf('</style>'));
 assert.match(css,/@media \(min-width:900px\) and \(max-height:1100px\) and \(display-mode:browser\)/);
 assert.match(css,/\.type-photo-wrap\{height:96px\}/);
 assert.match(css,/\.road-status-row\{padding:3px 0\}/);
 assert.match(css,/\.weather-metrics\{gap:1px 8px/);
 assert.match(css,/\.fs-schedule/);
 assert.match(css,/@media \(min-width:900px\) and \(max-height:800px\)/);
 assert.doesNotMatch(css,/\.nearest-panel details\.road-status-side\{[^}]*display:none/);
 assert.match(html,/\.nearest-panel\{[^}]*overflow-y:auto/);
});

test('desktop road traffic details start closed and retain all five names when expanded',()=>{
 const details=html.match(/<details class="road-status-side">([\s\S]*?)<\/details>/);
 assert.ok(details,'collapsible roads exist');
 assert.doesNotMatch(details[0],/<details[^>]*\sopen\b/);
 assert.match(details[0],/<summary>/);
 assert.match(details[0],/5 forbindelser/);
 assert.match(details[0],/id="road-status-side"/);
 assert.match(details[0],/Kontroller hos Vegvesenet/);
 assert.match(html,/details\.road-status-side\[open\] summary/);
 assert.match(html,/class="schedule road-status-regular"/);
});
