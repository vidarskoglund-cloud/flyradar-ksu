const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const start=app.indexOf('const FEATURED_FAST_FERRIES=');
const end=app.indexOf('function vesselKind(v){',start);
assert.ok(start>=0&&end>start);
const context=vm.createContext({
 String,Number,
 selectedVesselTypeKey:'258416000',
 vesselKey:v=>String(v.mmsi||v.name||'').trim(),
 vesselHeading:v=>Number(v.heading??v.course??0),
 L:{divIcon:options=>options}
});
vm.runInContext(app.slice(start,end),context);
test('recognize EKSPRESSEN by AIS MMSI, with missing-MMSI name fallback only',()=>{
 assert.equal(context.featuredFastFerry({name:'EKSPRESSEN',mmsi:'258416000'}),true);
 assert.equal(context.featuredFastFerry({name:'EKSPRESSEN'}),true);
 assert.equal(context.featuredFastFerry({name:'OTHER',mmsi:'258416000'}),true);
 assert.equal(context.featuredFastFerry({name:'EKSPRESSEN',mmsi:'999999999'}),false);
 assert.equal(context.featuredFastFerry({name:'NORDKAPP',mmsi:'123'}),false);
});
test('featured marker has visible name, ship silhouette and retains heading rotation',()=>{
 const icon=context.vesselIcon({name:'EKSPRESSEN',mmsi:'258416000',heading:254});
 assert.match(icon.className,/vessel-wrap-featured/);
 assert.match(icon.html,/fast-ferry-label">EKSPRESSEN/);
 assert.match(icon.html,/rotate\(254deg\)/);
 assert.match(icon.html,/<svg/);
 assert.match(icon.html,/fast-ferry selected/);
 assert.equal(icon.iconAnchor[0],20);
});
test('ordinary vessels use visible bow, deck and hull instead of triangular arrows',()=>{
 const icon=context.vesselIcon({name:'NORDKAPP',mmsi:'123',course:89});
 assert.match(icon.className,/vessel-wrap-standard/);
 assert.match(icon.html,/vessel-shape/);
 assert.match(icon.html,/class="hull"/);
 assert.match(icon.html,/class="cabin"/);
 assert.match(icon.html,/rotate\\(89deg\\)/);
 assert.doesNotMatch(icon.html,/▲/);
 assert.equal(icon.iconSize[0],32);
});
test('feature style is separate from generic markers and labels do not rotate',()=>{
 assert.match(html,/\.vessel-wrap-featured \.fast-ferry-label/);
 assert.match(html,/pointer-events:none/);
 assert.match(html,/app\.js\?v=230/);
 assert.match(app,/querySelector\('\.vessel-marker'\)/);
});

test('FJORDPRINSESSEN has a distinct named icon without promoting planned vessels',()=>{
 assert.equal(context.featuredFastFerry({name:'FJORDPRINSESSEN',mmsi:'259604000'}),true);
 assert.equal(context.featuredFastFerry({name:'FJORDPRINSESSEN',mmsi:'999999999'}),false);
 for(const [name,mmsi] of [['VINGTOR','257151900'],['NJORD','257781000'],['FRØYA','257605000']])
  assert.equal(context.featuredFastFerry({name,mmsi}),false);
 const icon=context.vesselIcon({name:'FJORDPRINSESSEN',mmsi:'259604000',heading:62});
 assert.match(icon.html,/fast-ferry-label">FJORDPRINSESSEN/);
 assert.match(icon.html,/rotate\(62deg\)/);
});

test('Hurtigruten/Havila get a warm-gold named marker from AIS category',()=>{
 const icon=context.vesselIcon({name:'MS NORDLYS',mmsi:'257100001',category:'hurtigrute',course:145});
 assert.match(icon.className,/vessel-wrap-coastal/);
 assert.match(icon.html,/coastal-ship-label">MS NORDLYS/);
 assert.match(icon.html,/rotate\(145deg\)/);
 assert.match(icon.html,/<svg/);
 assert.equal(icon.iconSize[0],40);
 assert.match(html,/\.vessel-wrap-coastal \.coastal-ship-label/);
});
test('coastal category is necessary and the AIS name is escaped in label',()=>{
 const ordinary=context.vesselIcon({name:'MS NORDLYS',mmsi:'257100001',category:'other',course:145});
 assert.match(ordinary.className,/vessel-wrap-standard/);
 const unknown=context.vesselIcon({name:'MS <NORD> & SONS',category:'hurtigrute',heading:0});
 assert.match(unknown.html,/MS &lt;NORD&gt; &amp; SONS/);
 assert.doesNotMatch(unknown.html,/MS <NORD>/);
});
test('featured fast ferry styling remains distinct from coastal ship',()=>{
 const ferry=context.vesselIcon({name:'EKSPRESSEN',mmsi:'258416000',category:'hurtigbat',heading:254});
 assert.match(ferry.html,/fast-ferry-label/);
 assert.doesNotMatch(ferry.html,/coastal-ship-label/);
});

test('both featured vessel types use balanced 40px markers with smaller glow',()=>{
 for(const v of [{name:'EKSPRESSEN',mmsi:'258416000',heading:90},{name:'MS NORDLYS',category:'hurtigrute',heading:90}]){
  const icon=context.vesselIcon(v);
  assert.equal(icon.iconSize[0],40);
  assert.equal(icon.iconAnchor[0],20);
  assert.match(icon.html,/rotate\(90deg\)/);
 }
 assert.match(html,/\.vessel-marker.fast-ferry\{width:40px;height:40px/);
 assert.match(html,/\.vessel-marker.coastal-ship\{width:40px;height:40px/);
 assert.match(html,/width:36px;height:36px/);
});

test('AIS passenger and fast craft have separate compact vessel silhouettes',()=>{
 const fast=context.vesselIcon({name:'LOCAL FAST',mmsi:'987',shipType:40,heading:180});
 const ferry=context.vesselIcon({name:'LOCAL FERRY',mmsi:'986',shipType:60,heading:270});
 const unknown=context.vesselIcon({name:'UNKNOWN',mmsi:'985',shipType:0,heading:20});
 assert.match(fast.className,/vessel-wrap-fast/);
 assert.match(ferry.className,/vessel-wrap-passenger/);
 assert.match(unknown.className,/vessel-wrap-standard/);
 for(const icon of [fast,ferry,unknown]){
  assert.match(icon.html,/class="hull"/);
  assert.match(icon.html,/class="bow"/);
  assert.match(icon.html,/class="cabin"/);
 }
 assert.match(fast.html,/rotate\\(180deg\\)/);
 assert.match(ferry.html,/rotate\\(270deg\\)/);
 assert.match(html,/\.vessel-wrap-fast \.vessel-shape/);
});
