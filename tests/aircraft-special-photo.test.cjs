const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const photos=fs.readFileSync(path.join(__dirname,'../aircraft-photos.js'),'utf8');
const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const p0=photos.indexOf('const TYPE_SEARCH='),p1=photos.indexOf('async function lookupType(',p0);
assert.ok(p0>0&&p1>p0);
const photoCtx={plain:x=>String(x),String,Number,Object};
vm.runInNewContext(photos.slice(p0,p1)+';globalThis.choose=chooseTypePhoto;',photoCtx);
const choose=photoCtx.choose;
function image(filename,category='Category:Gulfstream V'){
 return {title:'File:'+filename,categories:[{title:category}],imageinfo:[{
 thumburl:'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1c/photo.jpg',
 descriptionurl:'https://commons.wikimedia.org/wiki/File:'+filename,
 extmetadata:{LicenseShortName:{value:'CC BY-SA 4.0'},
 LicenseUrl:{value:'https://creativecommons.org/licenses/by-sa/4.0/'},
 Artist:{value:'Photographer'}}
 }]};
}
test('Gulfstream V representative photo can be found with model names, not registration',()=>{
 const p=choose('GLF5',{a:image('Gulfstream_V_flying.jpg')});
 assert.ok(p);
 assert.equal(p.exact,false);
 assert.match(p.source,/commons.wikimedia.org/);
});
test('Gulfstream unrelated model and copyrighted files are not used',()=>{
 assert.equal(choose('GLF5',{a:image('Gulfstream_G550.jpg','Category:Gulfstream G550')}),null);
 const bad=image('Gulfstream_V.jpg');
 bad.imageinfo[0].extmetadata.LicenseShortName.value='CC BY-NC 4.0';
 assert.equal(choose('GLF5',{a:bad}),null);
});
test('military and rescue classification requires evidence; GLF5 is not automatically military',()=>{
 const start=app.indexOf('function militaryAircraftLabel(');
 const end=app.indexOf('function inferredAirportCandidate(',start);
 const ctx={};
 vm.runInNewContext(app.slice(start,end)+';globalThis.category=specialFlightCategory;',ctx);
 const classify=ctx.category;
 assert.equal(classify({type:'GLF5',flight:'ABC123',operator:'Private',desc:'Gulfstream V'}),null);
 assert.equal(classify({type:'GLF5',flight:'GAF123',operator:'',desc:''})?.id,'military');
 assert.equal(classify({type:'AW10',flight:'SAR123',desc:''})?.id,'rescue');
 assert.equal(classify({type:'S92',operator:'Air ambulance',flight:'HEL1'})?.id,'ambulance');
 assert.equal(classify({type:'B738',flight:'POL12'})?.id,'police');
});
test('confirmed KSU approaches remain ahead of special traffic and priority is only local',()=>{
 assert.match(app,/if\(role&&d<=50\)rank=Math.max\(rank,role.rank\)/);
 assert.match(app,/if\(finalApproach\)rank=5\.5/);
 assert.match(app,/if\(arrival&&d<=100/);
 assert.match(html,/data-special-role/);
 assert.match(html,/aircraft-photos\.js\?v=2/);
});
test('only selected aircraft receives lookup and photo type never claims exact registration',()=>{
 assert.match(photos,/window\.loadSelectedAircraftPhoto/);
 assert.match(photos,/hasReg\?await lookup\(reg\):null/);
 assert.match(photos,/await lookupType\(code\)/);
 assert.match(photos,/Eksempelbilde av flytypen/);
 assert.match(photos,/dataset\.photoIdentity!==identity/);
 assert.match(photos,/kristiansund-aircraft-photos-v2/);
});
