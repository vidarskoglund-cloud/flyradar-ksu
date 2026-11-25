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
 assert.equal(icon.iconAnchor[0],26);
});
test('other vessels keep the original triangle marker and icon size',()=>{
 const icon=context.vesselIcon({name:'NORDKAPP',mmsi:'123',course:89});
 assert.equal(icon.className,'vessel-wrap');
 assert.match(icon.html,/>▲<\/div>/);
 assert.equal(icon.iconSize[0],26);
});
test('feature style is separate from generic markers and labels do not rotate',()=>{
 assert.match(html,/\.vessel-wrap-featured \.fast-ferry-label/);
 assert.match(html,/pointer-events:none/);
 assert.match(html,/app\.js\?v=224/);
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
 assert.match(icon.html,/rotate\\(145deg\\)/);
 assert.match(icon.html,/<svg/);
 assert.equal(icon.iconSize[0],52);
 assert.match(html,/\\.vessel-wrap-coastal \\.coastal-ship-label/);
});
test('coastal category is necessary and the AIS name is escaped in label',()=>{
 const ordinary=context.vesselIcon({name:'MS NORDLYS',mmsi:'257100001',category:'other',course:145});
 assert.equal(ordinary.className,'vessel-wrap');
 const unknown=context.vesselIcon({name:'MS <NORD> & SONS',category:'hurtigrute',heading:0});
 assert.match(unknown.html,/MS &lt;NORD&gt; &amp; SONS/);
 assert.doesNotMatch(unknown.html,/MS <NORD>/);
});
test('featured fast ferry styling remains distinct from coastal ship',()=>{
 const ferry=context.vesselIcon({name:'EKSPRESSEN',mmsi:'258416000',category:'hurtigbat',heading:254});
 assert.match(ferry.html,/fast-ferry-label/);
 assert.doesNotMatch(ferry.html,/coastal-ship-label/);
});
