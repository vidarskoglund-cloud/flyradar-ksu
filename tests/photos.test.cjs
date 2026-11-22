const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const src=(name)=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const planeSource=src('aircraft-photos.js'),shipSource=src('vessel-photos.js');
function candidate(source,begin,end,funcName){
 const a=source.indexOf(begin),b=source.indexOf(end,a);
 assert.ok(a>=0&&b>a);
 const context={Object,String,Array,RegExp,Number,plain:x=>String(x),document:{}};
 vm.runInNewContext(source.slice(a,b)+';globalThis.result='+funcName,context);
 return context.result;
}
const exact=candidate(planeSource,'function chooseExactRegistration(', 'async function lookup(', 'chooseExactRegistration');
const ship=candidate(shipSource,'function vesselWords(', 'async function search(', 'pick');
const metadata={
 LicenseShortName:{value:'CC BY-SA 4.0'},LicenseUrl:{value:'https://creativecommons.org/licenses/by-sa/4.0/'},
 Artist:{value:'Sample photographer'}
};
const photo=(title)=>({title:'File:'+title,imageinfo:[{
 thumburl:'https://upload.wikimedia.org/example.jpg',
 descriptionurl:'https://commons.wikimedia.org/wiki/File:'+title,
 extmetadata:metadata
}]});
test('exact aircraft registration matches and unrelated registration does not',()=>{
 assert.ok(exact('LN-WDI',{one:photo('LN-WDI_at_KSU.jpg')}));
 assert.equal(exact('LN-WDI',{one:photo('LN-WDE_at_KSU.jpg')}),null);
});
test('aircraft image requires compatible source and license',()=>{
 const bad=photo('LN-WDI.jpg');bad.imageinfo[0].extmetadata={LicenseShortName:{value:'All rights reserved'}};
 assert.equal(exact('LN-WDI',{one:bad}),null);
});
test('ship IMO or MMSI can authenticate imagery',()=>{
 const v={name:'WATERLORD',imo:'9123456',mmsi:'257827000'};
 assert.equal(ship(v,{one:photo('Ship_IMO_9123456.jpg')}).confirmedId,true);
 assert.equal(ship(v,{one:photo('MMSI_257827000.jpg')}).confirmedId,true);
});
test('ambiguous single-word ship names are not accepted without vessel context',()=>{
 const v={name:'WATERLORD',mmsi:'257827000'};
 assert.equal(ship(v,{one:photo('WATERLORD_logo.jpg')}),null);
 assert.equal(ship(v,{one:photo('WATERLORD_landscape.jpg')}),null);
 const possible=ship(v,{one:photo('MV_WATERLORD.jpg')});
 assert.ok(possible);
 assert.equal(possible.confirmedId,false);
});
test('image lookups are cached, credited, and only update the current card',()=>{
 assert.match(planeSource,/localStorage\.setItem/);
 assert.match(shipSource,/localStorage\.setItem/);
 assert.match(planeSource,/dataset\.photoIdentity!==identity/);
 assert.match(shipSource,/dataset\.photoIdentity!==identity/);
 assert.match(planeSource,/Wikimedia Commons/);
 assert.match(shipSource,/Wikimedia Commons/);
});
test('existing app triggers photo lookup for selected plane and vessel',()=>{
 const app=src('app.js');
 assert.match(app,/window\.loadSelectedAircraftPhoto\(p,identity\)/);
 assert.match(app,/window\.loadSelectedVesselPhoto\(vessel,identity\)/);
 const page=src('index.html');
 assert.match(page,/aircraft-photos\.js/);
 assert.match(page,/vessel-photos\.js/);
});

test('ship image with plain vessel name is accepted when Commons category confirms ship context',()=>{
 const h=photo('Hillefjord_2019.jpg');
 h.categories=[{title:'Category:Hillefjord (ship, 2019)'},{title:'Category:Ships in Norway'}];
 const chosen=ship({name:'HILLEFJORD',imo:'9850719'},{one:h});
 assert.ok(chosen);
 assert.equal(chosen.confirmedId,false);
});
test('name-only landscape and wrong vessel identity are rejected',()=>{
 const landscape=photo('Hillefjord_landscape.jpg');
 assert.equal(ship({name:'HILLEFJORD'},{one:landscape}),null);
 const vessel=photo('MV_Hillefjord.jpg');
 assert.equal(ship({name:'HIOSFJORD'},{one:vessel}),null);
});
test('IMO in Commons category can verify a vessel even when image title lacks IMO',()=>{
 const h=photo('Ship_underway_2019.jpg');
 h.categories=[{title:'Category:IMO 9850719'},{title:'Category:Hillefjord (ship, 2019)'}];
 const chosen=ship({name:'HILLEFJORD',imo:'9850719'},{one:h});
 assert.equal(chosen?.confirmedId,true);
});
test('search uses name plus ship and vessel synonyms and reads Commons categories',()=>{
 assert.match(shipSource,/cleanName\+'" ship'/);
 assert.match(shipSource,/cleanName\+'" vessel'/);
 assert.match(shipSource,/prop:'imageinfo\|categories'/);
});
